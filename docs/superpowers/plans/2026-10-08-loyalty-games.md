# Loyalty Games Implementation Plan

> Thực hiện song song theo phạm vi độc lập đã được người dùng cho phép; root tích hợp và rà soát.

**Goal:** Hai trò chơi có trạng thái máy chủ và thưởng vào ví đúng thiết kế đã duyệt.
**Architecture:** Module game riêng dùng MongoDB transaction, route frontend lazy và nhiệm vụ theo pathname; tái sử dụng auth, voucher, notification.
**Tech Stack:** TypeScript, Express, Mongoose, React, Vite, node:test, Playwright.

- [x] Chốt luật và tạo mặt sau thẻ; lưu spec đã duyệt.
- [x] Asset: ánh xạ 10 ảnh sang id ổn định, WebP 480px và card back; giữ gốc; xác minh nhãn bằng đối chiếu hash ảnh đính kèm.
- [x] Backend: model game/account/pool; service giao dịch; GET state, POST visit/draw/flip/claim/redeem; yêu cầu session và CSRF như dự án.
- [x] Backend tests: dùng MongoDB thử riêng, giới hạn toàn cục10 và mỗi user1, retry/multitab, GMT+7, trừ đúng tồn kho và thưởng nguyên tử.
- [x] Frontend: /tro-choi, hai tab, bàn20lá, collection10loại, nhiệm vụ và đổi thưởng; API typed; launchertrái và visitor tracker.
- [x] UI: trạng thái chờ/error/guest, bàn phím, reduced motion, CSS đơn sắc vùng nguyên liệu giữ nền; mobile không tràn/chồng mascot.
- [x] Tích hợp: npm run typecheck; npm run lint; npm test; npm run build. Kiểm tra UI qua Playwright và kiểm tra hồi quy liên quan, sửa lỗi rồi chạy lại phần bị ảnh hưởng.
- [x] Rà soát diff, cập nhật tài liệu vận hành/luật và bàn giao kết quả cụ thể; không đọc .env hoặc ghi dữ liệu production.
