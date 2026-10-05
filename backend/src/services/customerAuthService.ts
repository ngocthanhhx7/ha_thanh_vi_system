import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AuthChallenge, TrustedDevice } from '../models/authChallenge.js';
import { CustomerAccountAppeal } from '../models/accountManagement.js';
import { CustomerUser, CustomerSession } from '../models/customer.js';
import { CustomerRepository, userView } from './customerRepository.js';
import { CustomerError, hashPassword, verifyPassword } from '../utils/customerSecurity.js';
import type { AuthMailer } from './authMail.js';
export type AuthOptions = {
  mailer: AuthMailer;
  publicWebUrl: string;
  challengeSecret: string;
  resetSecret: string;
};
export const TRUSTED_DEVICE_COOKIE = 'htv_trusted_device';
export const genericMailMessage =
  'Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi. Vui lòng thử lại sau nếu chưa nhận được email.';
export const isVerified = (user: { emailVerification?: string | null; verifiedAt?: Date | null }) =>
  user.emailVerification !== 'required' || Boolean(user.verifiedAt);
const hexToken = () => randomBytes(32).toString('hex');
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const trustedDeviceToken = (cookie?: string) =>
  cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(TRUSTED_DEVICE_COOKIE + '='))
    ?.slice(TRUSTED_DEVICE_COOKIE.length + 1);
const dummyHash = 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
export class CustomerAuthService {
  constructor(
    private repository: CustomerRepository,
    private options?: AuthOptions,
  ) {}
  private configured() {
    if (
      !this.options ||
      this.options.challengeSecret.length < 32 ||
      this.options.resetSecret.length < 32
    )
      throw new CustomerError(503, 'Dịch vụ xác thực email chưa khả dụng. Vui lòng thử lại sau.');
    return this.options;
  }
  private hash(domain: string, value: string, reset = false) {
    const options = this.configured();
    return createHmac('sha256', reset ? options.resetSecret : options.challengeSecret)
      .update(domain + ':' + value)
      .digest('hex');
  }
  private async passwordUser(email: string, password: string) {
    const user = await CustomerUser.findOne({ email }).select('+passwordHash').lean();
    const matches = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !matches) throw new CustomerError(401, 'Email hoặc mật khẩu chưa đúng.');
    return user;
  }
  async register(data: { name: string; email: string; phone: string; password: string }) {
    this.configured();
    let user = await CustomerUser.findOne({ email: data.email }).select('+passwordHash').lean();
    if (user) {
      // Only the password owner may resume an incomplete registration.
      const matches = await verifyPassword(data.password, user.passwordHash);
      if (isVerified(user) || !matches)
        throw new CustomerError(409, 'Không thể đăng ký với thông tin này.');
    } else {
      user = (
        await CustomerUser.create({
          name: data.name,
          email: data.email,
          phone: data.phone,
          passwordHash: await hashPassword(data.password),
          role: 'customer',
          emailVerification: 'required',
          verifiedAt: null,
          authVersion: 0,
        })
      ).toObject();
    }
    await this.sendEmailChallenge(user);
    return {
      verificationRequired: true,
      email: user.email,
      message: 'Vui lòng kiểm tra email và nhập mã xác thực.',
    };
  }
  private emailId(userId: string) {
    return this.hash('email-challenge-id', userId);
  }
  private async sendEmailChallenge(user: {
    _id: unknown;
    email: string;
    name: string;
    authVersion?: number | null;
  }) {
    const idHash = this.emailId(String(user._id));
    await AuthChallenge.updateOne(
      { idHash },
      {
        $setOnInsert: {
          idHash,
          userId: user._id,
          kind: 'email',
          authVersion: user.authVersion ?? 0,
          expiresAt: new Date(Date.now() + 600000),
          active: false,
          attempts: 0,
        },
      },
      { upsert: true },
    );
    // A reset may have invalidated an old unverified challenge.
    await AuthChallenge.updateOne(
      { idHash, authVersion: { $ne: user.authVersion ?? 0 } },
      {
        $set: { authVersion: user.authVersion ?? 0, active: false, attempts: 0 },
        $unset: { sentAt: 1, lease: 1, leaseUntil: 1 },
      },
    );
    return this.deliver(idHash, user.email, user.name);
  }
  private async deliver(idHash: string, email: string, name: string) {
    const options = this.configured();
    const now = new Date();
    const lease = hexToken();
    const reserved = await AuthChallenge.findOneAndUpdate(
      {
        idHash,
        $and: [
          {
            $or: [
              { sentAt: { $exists: false } },
              { sentAt: null },
              { sentAt: { $lte: new Date(Date.now() - 60000) } },
            ],
          },
          {
            $or: [
              { leaseUntil: { $exists: false } },
              { leaseUntil: null },
              { leaseUntil: { $lte: now } },
            ],
          },
        ],
      },
      { $set: { lease, leaseUntil: new Date(Date.now() + 30000) } },
      { new: true },
    ).lean();
    if (!reserved) return false;
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    try {
      await options.mailer.send({
        to: email,
        subject: 'Mã xác thực Hà Thành Vị',
        text: `Xin chào ${name}, mã xác thực Hà Thành Vị của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
        html: `<p>Xin chào ${escapeHtml(name)},</p><p>Mã xác thực của bạn: <strong>${code}</strong></p><p>Mã có hiệu lực trong 10 phút.</p>`,
      });
      await AuthChallenge.updateOne(
        { idHash, lease },
        {
          $set: {
            codeHash: this.hash('otp', idHash + ':' + code),
            active: true,
            attempts: 0,
            sentAt: new Date(),
            expiresAt: new Date(Date.now() + 600000),
          },
          $unset: { lease: 1, leaseUntil: 1 },
        },
      );
      return true;
    } catch {
      await AuthChallenge.updateOne({ idHash, lease }, { $unset: { lease: 1, leaseUntil: 1 } });
      throw new CustomerError(503, 'Hiện chưa thể gửi email. Vui lòng thử lại sau.');
    }
  }
  async resendEmail(email: string) {
    const user = await CustomerUser.findOne({ email }).lean();
    if (user && !isVerified(user)) {
      try {
        await this.sendEmailChallenge(user);
      } catch {
        /* Generic response includes delivery failure. */
      }
    }
  }
  private async consume(idHash: string, code: string, kind: string) {
    const challenge = await AuthChallenge.findOneAndUpdate(
      { idHash, kind, active: true, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } },
      { $inc: { attempts: 1 } },
      { new: true },
    ).lean();
    const actual = this.hash('otp', idHash + ':' + code);
    const expected =
      typeof challenge?.codeHash === 'string' && /^[a-f0-9]{64}$/.test(challenge.codeHash)
        ? challenge.codeHash
        : '0'.repeat(64);
    const matches = timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
    if (!challenge || !matches)
      throw new CustomerError(400, 'Mã xác thực chưa đúng hoặc đã hết hiệu lực.');
    const consumed = await AuthChallenge.findOneAndDelete({
      _id: challenge._id,
      codeHash: expected,
      active: true,
      attempts: { $lte: 5 },
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!consumed) throw new CustomerError(400, 'Mã xác thực chưa đúng hoặc đã hết hiệu lực.');
    return consumed;
  }
  private async grant(
    user: { _id: unknown; authVersion?: number | null; [key: string]: unknown },
    rememberDevice: boolean,
    createDevice: boolean,
  ) {
    const version = Number(user.authVersion ?? 0);
    const token = await this.repository.createSession(
      String(user._id),
      rememberDevice ? 30 : 1,
      version,
    );
    let deviceToken: string | undefined;
    if (rememberDevice && createDevice) {
      deviceToken = hexToken();
      await TrustedDevice.create({
        tokenHash: this.hash('trusted-device', deviceToken),
        userId: user._id,
        authVersion: version,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
    }
    return { user: userView(user), token, rememberDevice, deviceToken };
  }
  async verifyEmail(email: string, code: string, rememberDevice: boolean) {
    const user = await CustomerUser.findOne({ email }).lean();
    if (!user || isVerified(user))
      throw new CustomerError(400, 'Mã xác thực chưa đúng hoặc đã hết hiệu lực.');
    const challenge = await this.consume(this.emailId(String(user._id)), code, 'email');
    const verified = await CustomerUser.findOneAndUpdate(
      {
        _id: user._id,
        authVersion: challenge.authVersion,
        emailVerification: 'required',
        verifiedAt: null,
      },
      { $set: { verifiedAt: new Date() } },
      { new: true },
    ).lean();
    if (!verified) throw new CustomerError(400, 'Mã xác thực chưa đúng hoặc đã hết hiệu lực.');
    if (verified.accountStatus === 'suspended') return this.createAppealAccess(verified);
    return this.grant(verified, rememberDevice, true);
  }
  async login(email: string, password: string, rememberDevice: boolean, deviceToken?: string) {
    const user = await this.passwordUser(email, password);
    if (!isVerified(user))
      return {
        verificationRequired: true as const,
        email: user.email,
        message: 'Vui lòng xác thực email trước khi đăng nhập.',
      };
    this.configured();
    const suspended = user.accountStatus === 'suspended';
    if (!suspended && deviceToken && /^[a-f0-9]{64}$/.test(deviceToken)) {
      const device = await TrustedDevice.exists({
        tokenHash: this.hash('trusted-device', deviceToken),
        userId: user._id,
        authVersion: user.authVersion ?? 0,
        expiresAt: { $gt: new Date() },
      });
      if (device) return this.grant(user, rememberDevice, false);
    }
    const lease = hexToken();
    const reserved = await CustomerUser.findOneAndUpdate(
      {
        _id: user._id,
        authVersion: user.authVersion ?? 0,
        $and: [
          {
            $or: [
              { loginOtpSentAt: { $exists: false } },
              { loginOtpSentAt: { $lte: new Date(Date.now() - 60000) } },
            ],
          },
          {
            $or: [
              { loginOtpLeaseUntil: { $exists: false } },
              { loginOtpLeaseUntil: { $lte: new Date() } },
            ],
          },
        ],
      },
      { $set: { loginOtpLease: lease, loginOtpLeaseUntil: new Date(Date.now() + 30000) } },
      { new: true },
    ).lean();
    if (!reserved)
      throw new CustomerError(429, 'Vui lòng chờ 60 giây trước khi yêu cầu mã đăng nhập mới.');
    const challengeId = hexToken();
    const idHash = this.hash('login-challenge-id', challengeId);
    try {
      await AuthChallenge.create({
        idHash,
        userId: user._id,
        kind: 'login',
        authVersion: user.authVersion ?? 0,
        rememberDevice: suspended ? false : rememberDevice,
        active: false,
        attempts: 0,
        expiresAt: new Date(Date.now() + 600000),
      });
      await this.deliver(idHash, user.email, user.name);
      await CustomerUser.updateOne(
        { _id: user._id, loginOtpLease: lease },
        { $set: { loginOtpSentAt: new Date() } },
      );
    } finally {
      await CustomerUser.updateOne(
        { _id: user._id, loginOtpLease: lease },
        { $unset: { loginOtpLease: 1, loginOtpLeaseUntil: 1 } },
      );
    }
    return {
      otpRequired: true as const,
      challengeId,
      email: user.email,
      appealRequired: suspended,
      message: suspended
        ? 'Tài khoản đang tạm khóa. Hãy xác thực email để gửi kháng nghị đến quản trị viên.'
        : 'Vui lòng nhập mã xác thực đã gửi đến email.',
    };
  }
  async verifyLogin(challengeId: string, code: string) {
    const challenge = await this.consume(
      this.hash('login-challenge-id', challengeId),
      code,
      'login',
    );
    const user = await CustomerUser.findOne({
      _id: challenge.userId,
      authVersion: challenge.authVersion,
    }).lean();
    if (!user || !isVerified(user))
      throw new CustomerError(400, 'Mã xác thực chưa đúng hoặc đã hết hiệu lực.');
    if (user.accountStatus === 'suspended') return this.createAppealAccess(user);
    return this.grant(user, Boolean(challenge.rememberDevice), true);
  }
  private async createAppealAccess(user: { _id: unknown; authVersion?: number | null }) {
    const appealToken = hexToken();
    await AuthChallenge.create({
      idHash: this.hash('appeal-access', appealToken),
      userId: user._id,
      kind: 'appeal_access',
      authVersion: user.authVersion ?? 0,
      active: true,
      attempts: 0,
      expiresAt: new Date(Date.now() + 20 * 60000),
    });
    return {
      appealRequired: true as const,
      appealToken,
      message: 'Tài khoản đang tạm khóa. Bạn có thể gửi kháng nghị để quản trị viên xem xét.',
    };
  }
  async submitAccountAppeal(appealToken: string, message: string) {
    if (!/^[a-f0-9]{64}$/.test(appealToken))
      throw new CustomerError(401, 'Phiên kháng nghị không hợp lệ hoặc đã hết hạn.');
    const idHash = this.hash('appeal-access', appealToken);
    const access = await AuthChallenge.findOne({
      idHash,
      kind: 'appeal_access',
      active: true,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!access) throw new CustomerError(401, 'Phiên kháng nghị không hợp lệ hoặc đã hết hạn.');
    const user = await CustomerUser.findOne({
      _id: access.userId,
      authVersion: access.authVersion,
      accountStatus: 'suspended',
    }).lean();
    if (!user) throw new CustomerError(409, 'Tài khoản không còn cần kháng nghị.');
    const consumed = await AuthChallenge.findOneAndDelete({
      _id: access._id,
      idHash,
      kind: 'appeal_access',
      active: true,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!consumed) throw new CustomerError(409, 'Phiên kháng nghị đã được sử dụng.');
    const appeal = await CustomerAccountAppeal.findOneAndUpdate(
      { userId: user._id, status: 'pending' },
      {
        $set: {
          userName: user.name,
          userEmail: user.email,
          message,
          submittedAt: new Date(),
        },
        $setOnInsert: { userId: user._id, status: 'pending' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return {
      appeal: {
        id: String(appeal!._id),
        status: appeal!.status,
        submittedAt: appeal!.submittedAt,
      },
      message: 'Đã gửi kháng nghị. Quản trị viên sẽ xem xét yêu cầu của bạn.',
    };
  }
  async resendLogin(challengeId: string) {
    const idHash = this.hash('login-challenge-id', challengeId);
    const challenge = await AuthChallenge.findOne({
      idHash,
      kind: 'login',
      attempts: { $lt: 5 },
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!challenge) return;
    const user = await CustomerUser.findOne({
      _id: challenge.userId,
      authVersion: challenge.authVersion,
    }).lean();
    if (user && isVerified(user))
      try {
        await this.deliver(idHash, user.email, user.name);
      } catch {
        /* Generic retry message. */
      }
  }
  async forgotPassword(email: string) {
    const user = await CustomerUser.findOne({ email }).lean();
    // Email owners must be able to recover an account even if someone pre-registered their address.
    if (!user) return;
    let tokenHash: string | undefined;
    try {
      const options = this.configured();
      const token = hexToken();
      tokenHash = this.hash('password-reset', token, true);
      const url = new URL('/dat-lai-mat-khau', options.publicWebUrl);
      url.searchParams.set('token', token);
      await CustomerUser.updateOne(
        { _id: user._id, authVersion: user.authVersion ?? 0 },
        { $set: { resetTokenHash: tokenHash, resetExpiresAt: new Date(Date.now() + 1200000) } },
      );
      await options.mailer.send({
        to: email,
        subject: 'Đặt lại mật khẩu Hà Thành Vị',
        text: `Xin chào ${user.name}, mở liên kết để đặt lại mật khẩu: ${url.toString()}\nLiên kết có hiệu lực trong 20 phút và chỉ dùng một lần.`,
        html: `<p>Xin chào ${escapeHtml(user.name)},</p><p><a href="${escapeHtml(url.toString())}">Đặt lại mật khẩu</a></p><p>Liên kết có hiệu lực trong 20 phút và chỉ dùng một lần.</p>`,
      });
    } catch {
      if (tokenHash)
        await CustomerUser.updateOne(
          { _id: user._id, resetTokenHash: tokenHash },
          { $unset: { resetTokenHash: 1, resetExpiresAt: 1 } },
        );
    }
  }
  async resetPassword(token: string, password: string) {
    const tokenHash = this.hash('password-reset', token, true);
    const passwordHash = await hashPassword(password);
    const user = await CustomerUser.findOneAndUpdate(
      { resetTokenHash: tokenHash, resetExpiresAt: { $gt: new Date() } },
      {
        $set: { passwordHash },
        $inc: { authVersion: 1 },
        $unset: {
          resetTokenHash: 1,
          resetExpiresAt: 1,
          loginOtpSentAt: 1,
          loginOtpLease: 1,
          loginOtpLeaseUntil: 1,
        },
      },
      { new: true },
    ).lean();
    if (!user)
      throw new CustomerError(400, 'Liên kết đặt lại mật khẩu chưa hợp lệ hoặc đã hết hạn.');
    // Version checks revoke authentication immediately, even if physical cleanup is delayed.
    await Promise.allSettled([
      CustomerSession.deleteMany({ userId: user._id, authVersion: { $lt: user.authVersion ?? 0 } }),
      TrustedDevice.deleteMany({ userId: user._id, authVersion: { $lt: user.authVersion ?? 0 } }),
      AuthChallenge.deleteMany({ userId: user._id, authVersion: { $lt: user.authVersion ?? 0 } }),
    ]);
  }
}
