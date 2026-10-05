import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { ChatHandoff } from '../models/chatHandoff.js';
import { CustomerError } from '../utils/customerSecurity.js';

export type HandoffTranscriptMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type NewHandoffMessage = {
  sender: 'customer' | 'assistant' | 'system';
  content: string;
  authorName?: string;
  createdAt: Date;
};

export type ChatHandoffView = {
  id: string;
  status: 'waiting' | 'assigned' | 'resolved';
  customerType: 'guest' | 'account';
  assignedStaffName: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  staffUnreadCount: number;
  customerUnreadCount: number;
  auditTrail: {
    action: 'created' | 'customer_message' | 'claimed' | 'staff_message' | 'resolved';
    actorName: string | null;
    actorRole: 'guest' | 'customer' | 'staff' | 'admin' | 'system';
    occurredAt: string;
  }[];
  messages: {
    id: string;
    sender: 'customer' | 'assistant' | 'staff' | 'system';
    content: string;
    authorName: string | null;
    createdAt: string;
  }[];
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const preview = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 180);
const messageLimit = 250;

function view(record: {
  _id: Types.ObjectId;
  ownerUserId?: string | null;
  status: 'waiting' | 'assigned' | 'resolved';
  assignedStaffName?: string | null;
  assignedStaffId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  lastMessagePreview?: string;
  staffUnreadCount?: number;
  customerUnreadCount?: number;
  auditTrail?: {
    _id: Types.ObjectId;
    action: 'created' | 'customer_message' | 'claimed' | 'staff_message' | 'resolved';
    actorName?: string | null;
    actorRole: 'guest' | 'customer' | 'staff' | 'admin' | 'system';
    occurredAt: Date;
  }[];
  messages?: {
    _id: Types.ObjectId;
    sender: 'customer' | 'assistant' | 'staff' | 'system';
    content: string;
    authorName?: string | null;
    createdAt: Date;
  }[];
}): ChatHandoffView {
  return {
    id: String(record._id),
    status: record.status,
    customerType: record.ownerUserId ? 'account' : 'guest',
    assignedStaffName: record.assignedStaffName ?? null,
    assignedStaffId: record.assignedStaffId ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessageAt: record.lastMessageAt.toISOString(),
    lastMessagePreview: record.lastMessagePreview ?? '',
    staffUnreadCount: record.staffUnreadCount ?? 0,
    customerUnreadCount: record.customerUnreadCount ?? 0,
    auditTrail: (record.auditTrail ?? []).map((event) => ({
      action: event.action,
      actorName: event.actorName ?? null,
      actorRole: event.actorRole,
      occurredAt: event.occurredAt.toISOString(),
    })),
    messages: (record.messages ?? []).map((message) => ({
      id: String(message._id),
      sender: message.sender,
      content: message.content,
      authorName: message.authorName ?? null,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export class ChatHandoffService {
  private validId(id: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new CustomerError(404, 'Không tìm thấy cuộc tư vấn.');
    return new Types.ObjectId(id);
  }

  private customerAccess(userId?: string, token?: string) {
    const access: Record<string, unknown>[] = [];
    if (userId) access.push({ ownerUserId: userId });
    if (token && /^[\w-]{40,60}$/.test(token)) {
      access.push({
        ownerUserId: { $exists: false },
        accessTokenHash: hashToken(token),
        guestAccessExpiresAt: { $gt: new Date() },
      });
    }
    if (!access.length) throw new CustomerError(404, 'Không tìm thấy cuộc tư vấn.');
    return { $or: access };
  }

  async create(input: {
    userId?: string;
    userName?: string;
    accessToken?: string;
    transcript: HandoffTranscriptMessage[];
  }) {
    const accessToken = input.accessToken ?? randomBytes(32).toString('base64url');
    const now = new Date();
    const initialMessages: NewHandoffMessage[] = input.transcript.slice(-12).map((message) => ({
      sender: message.role === 'user' ? ('customer' as const) : ('assistant' as const),
      content: message.content,
      ...(message.role === 'user' && input.userName ? { authorName: input.userName } : {}),
      createdAt: now,
    }));
    const handoffMessage = 'Khách muốn được nhân viên tư vấn trực tiếp.';
    initialMessages.push({
      sender: 'system' as const,
      content: handoffMessage,
      authorName: 'Hệ thống',
      createdAt: now,
    });
    const lastMessage = [...initialMessages]
      .reverse()
      .find((message) => message.sender !== 'system');
    let record;
    try {
      record = await ChatHandoff.create({
        accessTokenHash: hashToken(accessToken),
        ...(input.userId ? { ownerUserId: input.userId, activeOwnerUserId: input.userId } : {}),
        ...(!input.userId ? { guestAccessExpiresAt: new Date(now.getTime() + 7 * 86400000) } : {}),
        status: 'waiting',
        messages: initialMessages,
        auditTrail: [
          {
            action: 'created',
            ...(input.userId ? { actorId: input.userId } : {}),
            actorName: input.userName || 'Khách vãng lai',
            actorRole: input.userId ? 'customer' : 'guest',
            occurredAt: now,
          },
        ],
        lastMessageAt: now,
        lastMessagePreview: preview(lastMessage?.content ?? handoffMessage),
        staffUnreadCount: 1,
      });
    } catch (error) {
      const isDuplicate =
        error && typeof error === 'object' && 'code' in error && Number(error.code) === 11000;
      if (!isDuplicate) throw error;
      let existing = input.userId
        ? await ChatHandoff.findOne({
            activeOwnerUserId: input.userId,
            status: { $in: ['waiting', 'assigned'] },
          }).lean()
        : await ChatHandoff.findOne({ accessTokenHash: hashToken(accessToken) }).lean();
      if (!existing) throw error;
      if (!input.userId && (existing.guestAccessExpiresAt?.getTime() ?? 0) <= Date.now()) {
        if (existing.status === 'resolved')
          throw new CustomerError(410, 'Phiên tư vấn đã hết hạn. Vui lòng tạo yêu cầu mới.');
        existing =
          (await ChatHandoff.findOneAndUpdate(
            { _id: existing._id, status: { $in: ['waiting', 'assigned'] } },
            { $set: { guestAccessExpiresAt: new Date(Date.now() + 7 * 86400000) } },
            { new: true },
          ).lean()) ?? existing;
      }
      return {
        handoff: view(existing),
        ...(!input.userId ? { accessToken } : {}),
      };
    }
    return {
      handoff: view(record.toObject()),
      ...(!input.userId ? { accessToken } : {}),
    };
  }

  async getForCustomer(id: string, userId?: string, token?: string) {
    const query = { _id: this.validId(id), ...this.customerAccess(userId, token) };
    await ChatHandoff.updateOne(
      { ...query, customerUnreadCount: { $gt: 0 } },
      { $set: { customerUnreadCount: 0 } },
    );
    if (!userId && token) {
      const now = Date.now();
      await ChatHandoff.updateOne(
        { ...query, guestAccessExpiresAt: { $lt: new Date(now + 86400000) } },
        { $set: { guestAccessExpiresAt: new Date(now + 7 * 86400000) } },
      );
    }
    const record = await ChatHandoff.findOne(query).lean();
    if (!record) throw new CustomerError(404, 'Không tìm thấy cuộc tư vấn.');
    return view(record);
  }

  async addCustomerMessage(
    id: string,
    userId: string | undefined,
    token: string | undefined,
    text: string,
  ) {
    const objectId = this.validId(id);
    const access = this.customerAccess(userId, token);
    const record = await ChatHandoff.findOne({ _id: objectId, ...access }).select(
      'status messages',
    );
    if (!record) throw new CustomerError(404, 'Không tìm thấy cuộc tư vấn.');
    if (record.status === 'resolved')
      throw new CustomerError(
        409,
        'Cuộc tư vấn này đã kết thúc. Hãy tạo yêu cầu mới nếu cần hỗ trợ.',
      );
    if (record.messages.length >= messageLimit)
      throw new CustomerError(409, 'Cuộc tư vấn đã đạt giới hạn tin nhắn. Hãy tạo yêu cầu mới.');

    const now = new Date();
    const updated = await ChatHandoff.findOneAndUpdate(
      {
        _id: objectId,
        ...access,
        status: { $in: ['waiting', 'assigned'] },
        $expr: { $lt: [{ $size: '$messages' }, messageLimit] },
      },
      {
        $push: {
          messages: { sender: 'customer', content: text, createdAt: now },
          auditTrail: {
            action: 'customer_message',
            ...(userId ? { actorId: userId } : {}),
            actorName: userId ? 'Khách hàng' : 'Khách vãng lai',
            actorRole: userId ? 'customer' : 'guest',
            occurredAt: now,
          },
        },
        $set: {
          lastMessageAt: now,
          lastMessagePreview: preview(text),
          ...(!userId ? { guestAccessExpiresAt: new Date(now.getTime() + 7 * 86400000) } : {}),
        },
        $inc: { staffUnreadCount: 1 },
      },
      { new: true },
    ).lean();
    if (!updated) throw new CustomerError(409, 'Cuộc tư vấn vừa thay đổi. Vui lòng tải lại.');
    return view(updated);
  }

  async staffSummary() {
    const active = { status: { $in: ['waiting', 'assigned'] } };
    const [waiting, unread] = await Promise.all([
      ChatHandoff.countDocuments({ status: 'waiting' }),
      ChatHandoff.countDocuments({ ...active, staffUnreadCount: { $gt: 0 } }),
    ]);
    return { waiting, unread };
  }

  async listForStaff() {
    const select = '-messages -auditTrail -accessTokenHash';
    const [waiting, assigned] = await Promise.all([
      ChatHandoff.find({ status: 'waiting' })
        .select(select)
        .sort({ lastMessageAt: 1 })
        .limit(100)
        .lean(),
      ChatHandoff.find({ status: 'assigned' })
        .select(select)
        .sort({ lastMessageAt: 1 })
        .limit(100)
        .lean(),
    ]);
    return [...waiting, ...assigned].slice(0, 100).map(view);
  }

  async getForStaff(id: string) {
    const objectId = this.validId(id);
    await ChatHandoff.updateOne(
      { _id: objectId, staffUnreadCount: { $gt: 0 } },
      { $set: { staffUnreadCount: 0 } },
    );
    const record = await ChatHandoff.findById(objectId).lean();
    if (!record) throw new CustomerError(404, 'Không tìm thấy cuộc tư vấn.');
    return view(record);
  }

  async claim(id: string, staff: { id: string; name: string; role: 'admin' | 'staff' }) {
    const objectId = this.validId(id);
    const now = new Date();
    const record = await ChatHandoff.findOneAndUpdate(
      {
        _id: objectId,
        status: { $in: ['waiting', 'assigned'] },
        $or: [{ assignedStaffId: { $exists: false } }, { assignedStaffId: null }],
      },
      {
        $set: {
          status: 'assigned',
          assignedStaffId: staff.id,
          assignedStaffName: staff.name,
          assignedAt: now,
          staffUnreadCount: 0,
        },
        $push: {
          auditTrail: {
            action: 'claimed',
            actorId: staff.id,
            actorName: staff.name,
            actorRole: staff.role,
            occurredAt: now,
          },
        },
      },
      { new: true },
    ).lean();
    if (record) return view(record);
    const alreadyClaimed = await ChatHandoff.findOne({
      _id: objectId,
      status: 'assigned',
      assignedStaffId: staff.id,
    }).lean();
    if (alreadyClaimed) return view(alreadyClaimed);
    throw new CustomerError(409, 'Yêu cầu đã được nhân viên khác tiếp nhận hoặc đã kết thúc.');
  }

  async reply(
    id: string,
    staff: { id: string; name: string; role: 'admin' | 'staff' },
    text: string,
  ) {
    const objectId = this.validId(id);
    const assignment =
      staff.role === 'admin'
        ? {}
        : {
            $or: [
              { assignedStaffId: staff.id },
              { assignedStaffId: { $exists: false } },
              { assignedStaffId: null },
            ],
          };
    const now = new Date();
    const record = await ChatHandoff.findOneAndUpdate(
      {
        _id: objectId,
        status: { $in: ['waiting', 'assigned'] },
        ...assignment,
        $expr: { $lt: [{ $size: '$messages' }, messageLimit] },
      },
      {
        $push: {
          messages: {
            sender: 'staff',
            content: text,
            authorId: staff.id,
            authorName: staff.name,
            createdAt: now,
          },
          auditTrail: {
            action: 'staff_message',
            actorId: staff.id,
            actorName: staff.name,
            actorRole: staff.role,
            occurredAt: now,
          },
        },
        $set: {
          status: 'assigned',
          assignedStaffId: staff.id,
          assignedStaffName: staff.name,
          assignedAt: now,
          lastMessageAt: now,
          lastMessagePreview: preview(text),
        },
        $inc: { customerUnreadCount: 1 },
      },
      { new: true },
    ).lean();
    if (!record)
      throw new CustomerError(409, 'Yêu cầu đã kết thúc hoặc đang do nhân viên khác xử lý.');
    return view(record);
  }

  async resolve(id: string, staff: { id: string; name: string; role: 'admin' | 'staff' }) {
    const assignment = staff.role === 'admin' ? {} : { assignedStaffId: staff.id };
    const record = await ChatHandoff.findOneAndUpdate(
      { _id: this.validId(id), status: 'assigned', ...assignment },
      {
        $set: { status: 'resolved', resolvedAt: new Date() },
        $unset: { activeOwnerUserId: 1 },
        $push: {
          auditTrail: {
            action: 'resolved',
            actorId: staff.id,
            actorName: staff.name,
            actorRole: staff.role,
            occurredAt: new Date(),
          },
        },
      },
      { new: true },
    ).lean();
    if (!record)
      throw new CustomerError(409, 'Hãy nhận yêu cầu trước khi kết thúc hoặc tải lại hàng đợi.');
    return view(record);
  }
}
