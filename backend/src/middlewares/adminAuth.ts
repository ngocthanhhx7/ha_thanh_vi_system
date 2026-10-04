import { requireRole } from './customerAuth.js';

// All authorization comes from the current user document loaded by the session middleware.
export const createAdminAuth = () => requireRole('admin');
