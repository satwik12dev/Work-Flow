import { authService } from './auth.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { config } from '../../config/index.js';
import { parseDuration } from './auth.constants.js';
import { tokenService } from '../../services/token.service.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: parseDuration(config.JWT_REFRESH_EXPIRES),
  path: '/api/v1/auth',
};

class AuthController {
  // ─── Register ───────────────────────────────────────────────
  register = asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);
    ApiResponse.created(
      res,
      'User registered successfully. A verification code has been sent to your email.',
      { user }
    );
  });

  // ─── Login ──────────────────────────────────────────────────
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || '';

    const { user, accessToken, refreshToken } = await authService.login({
      email,
      password,
      userAgent,
      ipAddress,
    });

    // Set refresh token in HTTP-only cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    ApiResponse.success(res, 'Login successful', {
      user,
      accessToken,
    });
  });

  // ─── OTP Endpoints ──────────────────────────────────────────
  sendOtp = asyncHandler(async (req, res) => {
    const result = await authService.sendOtp(req.body);
    ApiResponse.success(res, result.message, { expiresInSeconds: result.expiresInSeconds });
  });

  verifyOtp = asyncHandler(async (req, res) => {
    const result = await authService.verifyOtp(req.body);
    ApiResponse.success(res, result.message, {
      verified: result.verified,
      resetToken: result.resetToken,
    });
  });

  resendOtp = asyncHandler(async (req, res) => {
    const result = await authService.resendOtp(req.body);
    ApiResponse.success(res, result.message, { expiresInSeconds: result.expiresInSeconds });
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email);
    ApiResponse.success(res, result.message);
  });

  resetPassword = asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    ApiResponse.success(res, result.message);
  });

  // ─── Refresh Token ──────────────────────────────────────────
  refreshTokens = asyncHandler(async (req, res) => {
    const incomingToken =
      req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    if (!incomingToken) {
      throw ApiError.unauthorized('Refresh token is required');
    }

    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.socket?.remoteAddress || '';

    const { user, accessToken, refreshToken } = await authService.refreshTokens({
      refreshToken: incomingToken,
      userAgent,
      ipAddress,
    });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    ApiResponse.success(res, 'Tokens refreshed successfully', {
      user,
      accessToken,
    });
  });

  // ─── Logout ─────────────────────────────────────────────────
  logout = asyncHandler(async (req, res) => {
    const incomingToken =
      req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    if (incomingToken) {
      try {
        const decoded = tokenService.verifyRefreshToken(incomingToken);
        await authService.logout(decoded.sessionId, decoded.userId);
      } catch {
        // Token was invalid or expired — still clear the cookie
      }
    }

    res.clearCookie(REFRESH_COOKIE_NAME, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: 0,
    });

    ApiResponse.success(res, 'Logged out successfully');
  });

  // ─── Logout All ─────────────────────────────────────────────
  logoutAll = asyncHandler(async (req, res) => {
    const result = await authService.logoutAll(req.user._id);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: 0,
    });

    ApiResponse.success(res, 'Logged out from all devices', result);
  });

  // ─── Get Current User ───────────────────────────────────────
  getMe = asyncHandler(async (req, res) => {
    const user = await authService.getCurrentUser(req.user._id);
    ApiResponse.success(res, 'User profile retrieved', { user });
  });

  // ─── Change Password ───────────────────────────────────────
  changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user._id, oldPassword, newPassword);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: 0,
    });

    ApiResponse.success(res, 'Password changed successfully. Please log in again.');
  });

  // ─── Get Active Sessions ────────────────────────────────────
  getSessions = asyncHandler(async (req, res) => {
    const sessions = await authService.getUserSessions(req.user._id);
    ApiResponse.success(res, 'Active sessions retrieved', { sessions });
  });
}

export const authController = new AuthController();
