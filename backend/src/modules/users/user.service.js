import { User } from './user.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/helpers.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';

class UserService {
  async getById(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return user.toJSON();
  }

  async updateProfile(userId, updates) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (updates.name) {
      user.name = updates.name;
    }

    await user.save();
    return user.toJSON();
  }

  async searchUsers(query) {
    const { page, limit, skip, sort } = getPaginationParams(query);
    const filter = {};

    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    const [users, totalDocs] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    const sanitizedUsers = users.map((u) => {
      delete u.password;
      delete u.__v;
      return u;
    });

    return {
      users: sanitizedUsers,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }
}

export const userService = new UserService();

