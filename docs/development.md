# Phát triển và Git

Ngọc Thành là người phát triển duy nhất. Một repository, hai npm workspace; ưu tiên thay đổi nhỏ, dễ kiểm tra và lịch sử commit rõ nghĩa.

## Commit

Định dạng `type: short description`, không scope trong cấu hình hiện tại. Các type: feat, fix, docs, refactor, test, chore. Ví dụ `feat: add customer address book`. Mỗi commit có một mục đích; commit tài liệu riêng khi chỉ thay docs. Commit hook chạy commitlint; CI kiểm tra chất lượng và commit trong lần push/PR.

Cấu hình tác giả dùng local repository, không thay Git toàn máy:

```sh
git config user.name "Ngọc Thành"
git config user.email "thanhnnhe186491@fpt.edu.vn"
```

## Đưa lên Git

Commit source, package-lock, cấu hình build/lint/CI, env mẫu không có giá trị bí mật, tài liệu, test và tài nguyên web tối ưu. Không commit dependencies, dist, env thật, dữ liệu MongoDB, upload, cache, báo cáo test, file IDE, skill/agent/CLI và tài nguyên Illustrator gốc.

`.gitignore` bỏ qua `.local`, `.claude`, `.codex`, `.gemini`, `.agents`, `.agent`, `skills`, `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` và `assets/originals`. Các công cụ AI có thể dùng ngoài lịch sử dự án. `.env.example` là ngoại lệ để mô tả biến cấu hình an toàn.

## Kiểm tra

`npm run verify` chạy typecheck, lint, backend tests và build hai workspace. `npm run test:e2e` kiểm tra UI desktop/mobile; dùng Playwright browser đã cài qua `npx playwright install chromium`. Kiểm tra định dạng bằng `npm run format:check`.

Khi thêm API, giữ schema request/response và tài liệu khớp với caller. Test tập trung quyền truy cập, tính tiền, idempotency, chuyển trạng thái và lỗi thực tế. Khi chỉnh giao diện, kiểm tra mobile/tablet/desktop, bàn phím và chế độ giảm chuyển động.
