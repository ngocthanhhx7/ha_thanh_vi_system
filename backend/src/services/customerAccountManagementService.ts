import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import { AuthChallenge, TrustedDevice } from '../models/authChallenge.js';
import { CustomerAccountAppeal, CustomerAccountAudit } from '../models/accountManagement.js';
import { CustomerSession, CustomerUser } from '../models/customer.js';
import { CustomerError } from '../utils/customerSecurity.js';
import { userView, type AccountStatus, type Role, type UserView } from './customerRepository.js';
import { notificationService } from './notificationService.js';

export type AccountAdminActor = {
  id: string;
  name: string;
  email: string;
  ip?: string;
  userAgent?: string;
};
export type AccountUserPatch = {
  name?: string;
  phone?: string;
  role?: Role;
  accountStatus?: AccountStatus;
  reason?: string;
};

const accountStatusOf = (user: Record<string, unknown>): AccountStatus =>
  user.accountStatus === 'suspended' ? 'suspended' : 'active';

export class CustomerAccountManagementService {
  async updateUser(
    id: string,
    patch: AccountUserPatch,
    actor: AccountAdminActor,
  ): Promise<UserView> {
    return this.applyUserUpdate(id, patch, actor, true);
  }

  private async applyUserUpdate(
    id: string,
    patch: AccountUserPatch,
    actor: AccountAdminActor,
    resolvePendingAppeals: boolean,
    session?: ClientSession,
  ): Promise<UserView> {
    if (!mongoose.isValidObjectId(id)) throw new CustomerError(404, 'Không tìm thấy tài khoản.');
    let currentQuery = CustomerUser.findById(id);
    if (session) currentQuery = currentQuery.session(session);
    const current = await currentQuery.lean();
    if (!current) throw new CustomerError(404, 'Không tìm thấy tài khoản.');

    const currentRole = (current.role ?? 'customer') as Role;
    const currentStatus = accountStatusOf(current as Record<string, unknown>);
    const nextRole = patch.role ?? currentRole;
    const nextStatus = patch.accountStatus ?? currentStatus;
    const nextName = patch.name ?? current.name;
    const nextPhone = patch.phone ?? current.phone ?? '';
    const roleChanged = nextRole !== currentRole;
    const statusChanged = nextStatus !== currentStatus;
    const nameChanged = nextName !== current.name;
    const phoneChanged = nextPhone !== (current.phone ?? '');

    if (!roleChanged && !statusChanged && !nameChanged && !phoneChanged) return userView(current);
    if (String(current._id) === actor.id && (roleChanged || statusChanged))
      throw new CustomerError(
        403,
        'Bạn không thể tự đổi vai trò hoặc trạng thái tài khoản của mình.',
      );
    if (nextStatus === 'suspended' && statusChanged && !patch.reason?.trim())
      throw new CustomerError(400, 'Cần ghi rõ lý do tạm khóa tài khoản.');

    if (
      currentRole === 'admin' &&
      currentStatus === 'active' &&
      !(nextRole === 'admin' && nextStatus === 'active')
    ) {
      let adminCountQuery = CustomerUser.countDocuments({
        _id: { $ne: current._id },
        role: 'admin',
        accountStatus: { $ne: 'suspended' },
      });
      if (session) adminCountQuery = adminCountQuery.session(session);
      const otherActiveAdmins = await adminCountQuery;
      if (otherActiveAdmins < 1)
        throw new CustomerError(409, 'Hệ thống cần giữ ít nhất một quản trị viên đang hoạt động.');
    }

    const changes: { field: string; before: unknown; after: unknown }[] = [];
    if (nameChanged) changes.push({ field: 'name', before: current.name, after: nextName });
    if (phoneChanged)
      changes.push({ field: 'phone', before: current.phone ?? '', after: nextPhone });
    if (roleChanged) changes.push({ field: 'role', before: currentRole, after: nextRole });
    if (statusChanged)
      changes.push({ field: 'accountStatus', before: currentStatus, after: nextStatus });

    const set: Record<string, unknown> = { name: nextName, phone: nextPhone, role: nextRole };
    if (statusChanged) {
      set.accountStatus = nextStatus;
      set.accountStatusChangedAt = new Date();
      set.accountStatusChangedBy = actor.id;
      if (nextStatus === 'suspended') set.accountStatusReason = patch.reason!.trim();
    }
    const update: Record<string, unknown> = { $set: set };
    if (roleChanged || statusChanged) update.$inc = { authVersion: 1 };
    if (statusChanged && nextStatus === 'active') update.$unset = { accountStatusReason: 1 };

    let updateQuery = CustomerUser.findOneAndUpdate(
      {
        _id: current._id,
        authVersion: Number(current.authVersion ?? 0),
        role: current.role,
        ...(current.accountStatus === undefined
          ? { accountStatus: { $exists: false } }
          : { accountStatus: current.accountStatus }),
      },
      update,
      { new: true, runValidators: true, ...(session ? { session } : {}) },
    );
    if (session) updateQuery = updateQuery.session(session);
    const updated = await updateQuery.lean();
    if (!updated) throw new CustomerError(409, 'Tài khoản vừa được thay đổi. Tải lại và thử lại.');

    if (roleChanged || statusChanged) {
      await Promise.all([
        CustomerSession.deleteMany({ userId: current._id }, session ? { session } : undefined),
        TrustedDevice.deleteMany({ userId: current._id }, session ? { session } : undefined),
        AuthChallenge.deleteMany({ userId: current._id }, session ? { session } : undefined),
      ]);
    }

    const audit = new CustomerAccountAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      actorIp: actor.ip,
      actorUserAgent: actor.userAgent,
      targetUserId: current._id,
      targetName: updated.name,
      targetEmail: updated.email,
      action: 'admin.user.updated',
      changes,
      reason: patch.reason?.trim() || undefined,
    });
    await audit.save(session ? { session } : undefined);

    if (resolvePendingAppeals && statusChanged && nextStatus === 'active')
      await this.resolvePendingAppeals(current._id, actor, 'Tài khoản được quản trị viên mở lại.');

    return userView(updated);
  }

  async listAppeals() {
    return (
      await CustomerAccountAppeal.find({ status: 'pending' })
        .sort({ submittedAt: 1 })
        .limit(200)
        .lean()
    ).map((appeal) => ({
      id: String(appeal._id),
      userId: String(appeal.userId),
      userName: appeal.userName,
      userEmail: appeal.userEmail,
      message: appeal.message,
      status: appeal.status,
      submittedAt: appeal.submittedAt,
    }));
  }

  async reviewAppeal(
    id: string,
    decision: 'approve' | 'reject',
    note: string,
    actor: AccountAdminActor,
  ) {
    if (!mongoose.isValidObjectId(id)) throw new CustomerError(404, 'Không tìm thấy kháng nghị.');
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const result = await mongoose.connection.transaction(async (session) => {
      const appeal = await CustomerAccountAppeal.findById(id).session(session).lean();
      if (!appeal) throw new CustomerError(404, 'Không tìm thấy kháng nghị.');
      if (appeal.status !== 'pending') throw new CustomerError(409, 'Kháng nghị đã được xử lý.');

      const user = await CustomerUser.findById(appeal.userId).session(session).lean();
      if (!user) throw new CustomerError(404, 'Tài khoản kháng nghị không còn tồn tại.');
      if (
        decision === 'approve' &&
        accountStatusOf(user as Record<string, unknown>) === 'suspended'
      )
        await this.applyUserUpdate(
          String(user._id),
          { accountStatus: 'active', reason: note.trim() || 'Kháng nghị được chấp thuận.' },
          actor,
          false,
          session,
        );

      const reviewedAt = new Date();
      const updatedAppeal = await CustomerAccountAppeal.findOneAndUpdate(
        { _id: appeal._id, status: 'pending' },
        {
          $set: {
            status,
            reviewedBy: actor.id,
            reviewedByName: actor.name,
            reviewedByEmail: actor.email,
            reviewNote: note.trim(),
            reviewedAt,
          },
        },
        { new: true, session },
      ).lean();
      if (!updatedAppeal)
        throw new CustomerError(409, 'Kháng nghị vừa được xử lý. Tải lại danh sách.');

      const audit = new CustomerAccountAudit({
        actorUserId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        actorIp: actor.ip,
        actorUserAgent: actor.userAgent,
        targetUserId: user._id,
        targetName: user.name,
        targetEmail: user.email,
        action: `admin.appeal.${status}`,
        reason: note.trim() || undefined,
        details: { appealId: String(appeal._id) },
      });
      await audit.save({ session });

      return {
        id: String(updatedAppeal._id),
        status: updatedAppeal.status,
        reviewedAt: updatedAppeal.reviewedAt,
        reviewNote: updatedAppeal.reviewNote ?? '',
        userId: String(user._id),
      };
    });

    const { userId, ...appealResult } = result;
    await notificationService.safeUser(userId, {
      category: 'account',
      title:
        status === 'approved' ? 'Kháng nghị đã được chấp thuận' : 'Kháng nghị chưa được chấp thuận',
      message:
        status === 'approved'
          ? 'Tài khoản đã được mở lại. Hãy đăng nhập bằng mật khẩu và xác thực email.'
          : 'Quản trị viên đã xem xét kháng nghị. Bạn có thể xem ghi chú trong email hỗ trợ.',
      href: '/tai-khoan',
      eventKey: `account-appeal:${result.id}:reviewed`,
    });
    return appealResult;
  }

  async userAudit(id: string) {
    if (!mongoose.isValidObjectId(id)) throw new CustomerError(404, 'Không tìm thấy tài khoản.');
    const exists = await CustomerUser.exists({ _id: id });
    if (!exists) throw new CustomerError(404, 'Không tìm thấy tài khoản.');
    return (
      await CustomerAccountAudit.find({ targetUserId: id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ).map((entry) => ({
      id: String(entry._id),
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      actorIp: entry.actorIp,
      actorUserAgent: entry.actorUserAgent,
      action: entry.action,
      changes: entry.changes,
      reason: entry.reason ?? '',
      details: entry.details ?? null,
      createdAt: entry.createdAt,
    }));
  }

  private async resolvePendingAppeals(userId: unknown, actor: AccountAdminActor, note: string) {
    const pending = await CustomerAccountAppeal.find({ userId, status: 'pending' }).lean();
    if (!pending.length) return;
    const reviewedAt = new Date();
    await CustomerAccountAppeal.updateMany(
      { userId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          reviewedBy: actor.id,
          reviewedByName: actor.name,
          reviewedByEmail: actor.email,
          reviewNote: note,
          reviewedAt,
        },
      },
    );
    await CustomerAccountAudit.create(
      pending.map((appeal) => ({
        actorUserId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        actorIp: actor.ip,
        actorUserAgent: actor.userAgent,
        targetUserId: userId,
        targetName: appeal.userName,
        targetEmail: appeal.userEmail,
        action: 'admin.appeal.approved',
        reason: note,
        details: { appealId: String(appeal._id) },
      })),
    );
  }
}
