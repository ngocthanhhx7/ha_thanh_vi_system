import { test, expect } from '@playwright/test';
import content from '../../content/site.json';
const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
const user = {
  id: 'verified-customer',
  name: 'Bạn mới',
  email: 'test@example.com',
  phone: '0901234567',
  role: 'customer',
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/account/orders', (route) => route.fulfill(json({ orders: [] })));
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/chat/config', (route) =>
    route.fulfill(json({ enabled: false, name: 'Vị Ơi', suggestions: [] })),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(json({ message: 'Chưa đăng nhập' }, 401)),
  );
  await page.route('**/api/account/orders', (route) => route.fulfill(json({ orders: [] })));
});
test('registration confirms password then requires email OTP before creating a session', async ({
  page,
}) => {
  let registered = 0;
  await page.route('**/api/auth/register', (route) => {
    registered++;
    expect(route.request().postDataJSON().confirmPassword).toBe('newPassword123');
    return route.fulfill(
      json({ verificationRequired: true, email: user.email, message: 'Mã đã được gửi.' }, 201),
    );
  });
  await page.route('**/api/auth/verify-email', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: user.email,
      code: '123456',
      rememberDevice: true,
    });
    return route.fulfill(json({ user }));
  });
  await page.goto('/tai-khoan');
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByLabel('Họ và tên', { exact: true }).fill(user.name);
  await page.getByLabel('Số điện thoại', { exact: true }).fill(user.phone);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('newPassword123');
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('wrongPassword123');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('alert')).toContainText('chưa khớp');
  expect(registered).toBe(0);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('newPassword123');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Xác minh email của bạn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Xin chào, Bạn mới.' })).toHaveCount(0);
  await page.getByLabel('Tin cậy thiết bị này trong 30 ngày').check();
  await page.getByLabel('Mã xác minh', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xin chào, Bạn mới.' })).toBeVisible();
});
test('new device login handles invalid OTP and preserves challenge for retry', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(
      json({
        otpRequired: true,
        challengeId: 'challenge-test',
        email: user.email,
        message: 'Mã đã được gửi.',
      }),
    ),
  );
  await page.route('**/api/auth/verify-login', (route) => {
    expect(route.request().postDataJSON().challengeId).toBe('challenge-test');
    return route.fulfill(
      ++attempts === 1 ? json({ message: 'Mã chưa đúng hoặc đã hết hạn.' }, 400) : json({ user }),
    );
  });
  await page.goto('/tai-khoan');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /Gửi lại mã sau/ })).toBeDisabled();
  await page.getByLabel('Mã xác minh', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Mã chưa đúng');
  await page.getByLabel('Mã xác minh', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xin chào, Bạn mới.' })).toBeVisible();
});
test('forgot and reset password use generic messaging and scrub token from URL', async ({
  page,
}) => {
  await page.route('**/api/auth/forgot-password', (route) =>
    route.fulfill(json({ message: 'Nếu tài khoản phù hợp, liên kết đã được gửi.' }, 202)),
  );
  await page.route('**/api/auth/reset-password', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      token: 'test-reset-token',
      password: 'newPassword123',
      confirmPassword: 'newPassword123',
    });
    return route.fulfill(json({ message: 'Đã đổi mật khẩu. Hãy đăng nhập lại.' }));
  });
  await page.goto('/quen-mat-khau');
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('button', { name: 'Gửi liên kết đặt lại' }).click();
  await expect(page.getByRole('status')).toContainText('Nếu tài khoản phù hợp');
  await page.goto('/dat-lai-mat-khau?token=test-reset-token');
  await expect(page).toHaveURL(/\/dat-lai-mat-khau$/);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('newPassword123');
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('newPassword123');
  await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.getByRole('status')).toContainText('Đã đổi mật khẩu');
  await expect(page.getByRole('link', { name: 'Quay lại đăng nhập' })).toBeVisible();
});

test('OTP resend respects countdown and server cooldown before retry', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ otpRequired: true, challengeId: 'resend-challenge', email: user.email })),
  );
  let resends = 0;
  await page.route('**/api/auth/resend-login-otp', (route) => {
    expect(route.request().postDataJSON()).toEqual({ challengeId: 'resend-challenge' });
    resends++;
    return route.fulfill(
      resends === 1
        ? {
            ...json({ message: 'Vui lòng chờ trước khi gửi lại.', retryAfter: 90 }, 429),
            headers: { 'Retry-After': '90' },
          }
        : json({ message: 'Mã mới đã được gửi.' }, 202),
    );
  });
  await page.goto('/tai-khoan');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /Gửi lại mã sau/ })).toBeDisabled();
  for (let second = 0; second < 61; second++) await page.clock.fastForward(1000);
  await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Vui lòng chờ');
  await expect(page.getByRole('button', { name: 'Gửi lại mã sau 90s' })).toBeDisabled();
  for (let second = 0; second < 91; second++) await page.clock.fastForward(1000);
  await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Mã mới đã được gửi');
  expect(resends).toBe(2);
});

test('pending account login with verified password enters email verification from 403', async ({
  page,
}) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(
      json(
        {
          verificationRequired: true,
          email: user.email,
          message: 'Vui lòng xác minh email của bạn.',
        },
        403,
      ),
    ),
  );
  await page.route('**/api/auth/verify-email', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: user.email,
      code: '123456',
      rememberDevice: false,
    });
    return route.fulfill(json({ user }));
  });
  await page.goto('/tai-khoan');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Xác minh email của bạn' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Vui lòng xác minh email');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gửi lại mã', exact: true })).toBeEnabled();
  await page.getByLabel('Mã xác minh', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xin chào, Bạn mới.' })).toBeVisible();
});

test('ordinary login rejection remains an error and does not enter OTP', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ message: 'Không thể đăng nhập tài khoản này.' }, 403)),
  );
  await page.goto('/tai-khoan');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Không thể đăng nhập');
  await expect(page.getByRole('heading', { name: 'Mừng bạn trở lại' })).toBeVisible();
  await expect(page.getByLabel('Mã xác minh', { exact: true })).toHaveCount(0);
});
