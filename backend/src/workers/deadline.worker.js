import { Worker } from 'bullmq';
import { DEADLINE_QUEUE_NAME } from '../queues/deadline.queue.js';
import { redisConnectionOptions, enqueueEmailJob } from '../queues/email.queue.js';
import { Task } from '../modules/tasks/task.model.js';
import { EmailOutbox } from '../models/emailOutbox.model.js';
import { notificationService } from '../modules/notifications/notification.service.js';
import { TASK_STATUS } from '../constants/taskStatus.js';
import { NOTIFICATION_TYPE } from '../constants/notificationTypes.js';
import { logger } from '../config/logger.js';

/**
 * Scan tasks approaching deadline (within 24h) or overdue,
 * create in-app notifications, and dispatch reminder emails once per day per task.
 */
export const processDeadlineCheck = async () => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD for daily idempotency

  // 1. Approaching deadlines (due between now and +24h, not DONE)
  const upcomingTasks = await Task.find({
    isDeleted: false,
    status: { $ne: TASK_STATUS.DONE },
    assignedTo: { $ne: null },
    dueDate: { $gte: now, $lte: in24Hours },
  })
    .populate('assignedTo', 'name email')
    .populate('projectId', 'name');

  for (const task of upcomingTasks) {
    if (!task.assignedTo) continue;

    const eventId = `deadline-reminder-${task._id}-${dateKey}`;
    const existingOutbox = await EmailOutbox.findOne({ eventId });
    if (existingOutbox) continue; // Already notified today

    await notificationService.createAndEmit({
      recipientId: task.assignedTo._id,
      organizationId: task.organizationId,
      type: NOTIFICATION_TYPE.DEADLINE_APPROACHING,
      title: 'Upcoming Task Deadline',
      message: `Task "${task.title}" is due within 24 hours.`,
      metadata: { taskId: task._id, projectId: task.projectId?._id, dueDate: task.dueDate },
    });

    const outboxEvent = await EmailOutbox.create({
      eventId,
      organizationId: task.organizationId,
      eventType: 'DEADLINE_REMINDER',
      recipientEmail: task.assignedTo.email,
      recipientName: task.assignedTo.name,
      subject: `[WorkFlowX] Reminder: Task Due Soon - ${task.title}`,
      payload: {
        taskId: task._id.toString(),
        taskTitle: task.title,
        projectName: task.projectId?.name || 'Project',
        dueDate: task.dueDate.toISOString(),
      },
      status: 'QUEUED',
    });

    await enqueueEmailJob(outboxEvent);
  }

  // 2. Overdue tasks
  const overdueTasks = await Task.find({
    isDeleted: false,
    status: { $ne: TASK_STATUS.DONE },
    assignedTo: { $ne: null },
    dueDate: { $lt: now },
  }).select('_id title organizationId projectId assignedTo dueDate');

  for (const task of overdueTasks) {
    const overdueKey = `overdue-notif-${task._id}-${dateKey}`;
    // Check if an overdue notification was already created today
    const alreadySent = await EmailOutbox.findOne({ eventId: overdueKey });
    if (alreadySent) continue;

    await notificationService.createAndEmit({
      recipientId: task.assignedTo,
      organizationId: task.organizationId,
      type: NOTIFICATION_TYPE.TASK_OVERDUE,
      title: 'Task Overdue',
      message: `Task "${task.title}" has passed its deadline.`,
      metadata: { taskId: task._id, projectId: task.projectId, dueDate: task.dueDate },
    });

    // Record daily marker so we don't spam hourly
    await EmailOutbox.create({
      eventId: overdueKey,
      organizationId: task.organizationId,
      eventType: 'GENERIC_NOTIFICATION',
      recipientEmail: 'in-app@workflowx.local',
      subject: 'Overdue Task In-App Marker',
      payload: { taskId: task._id.toString() },
      status: 'SENT',
      processedAt: new Date(),
    });
  }

  logger.info(
    `Deadline scan complete: ${upcomingTasks.length} upcoming, ${overdueTasks.length} overdue.`
  );
};

export const startDeadlineWorker = () => {
  const worker = new Worker(DEADLINE_QUEUE_NAME, processDeadlineCheck, {
    connection: redisConnectionOptions,
    concurrency: 1,
  });

  worker.on('failed', (job, err) => {
    logger.error(`Deadline worker job ${job?.id} failed: ${err.message}`);
  });

  logger.info(`BullMQ Deadline Worker started listening on ${DEADLINE_QUEUE_NAME}`);
  return worker;
};

