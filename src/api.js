const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

function queryString(params) {
  if (!params) return '';
  if (params instanceof URLSearchParams) {
    const value = params.toString();
    return value ? `?${value}` : '';
  }
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

async function request(path, { method = 'GET', data, token, headers, ...options } = {}) {
  const requestHeaders = new Headers(headers || {});
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);

  const hasData = data !== undefined;
  if (hasData && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers: requestHeaders,
    body: hasData ? JSON.stringify(data) : options.body,
    credentials: 'omit',
  });
  return response;
}

const get = (path, token, params) => request(`${path}${queryString(params)}`, { token });
const post = (path, data, token) => request(path, { method: 'POST', data, token });
const put = (path, data, token) => request(path, { method: 'PUT', data, token });
const patch = (path, data, token) => request(path, { method: 'PATCH', data, token });
const remove = (path, token) => request(path, { method: 'DELETE', token });

export const api = {
  request,
  public: {
    restaurants: () => get('/api/public/restaurants'),
    storefront: (slug) => get(`/api/public/${encodeURIComponent(slug)}/storefront`),
    registerOwner: (payload) => post('/api/public/register-owner', payload),
    submitInquiry: (slug, payload) => post(`/api/public/${encodeURIComponent(slug)}/inquiries`, payload),
    trackInquiry: (slug, params) => get(`/api/public/${encodeURIComponent(slug)}/track`, undefined, params),
    respondToQuotation: (slug, quotationNumber, payload) => post(
      `/api/public/${encodeURIComponent(slug)}/quotations/${encodeURIComponent(quotationNumber)}/respond`,
      payload,
    ),
  },
  auth: {
    login: (payload) => post('/api/auth/login', payload),
    me: (token) => get('/api/auth/me', token),
    logout: (token) => post('/api/auth/logout', undefined, token),
  },
  admin: {
    overview: (token) => get('/api/admin/overview', token),
    landingPage: (token, query) => get(`/api/admin/landing-page${query || ''}`, token),
    saveLandingPage: (payload, token, query) => patch(`/api/admin/landing-page${query || ''}`, payload, token),
    services: (token, query) => get(`/api/admin/services${query || ''}`, token),
    createService: (payload, token, query) => post(`/api/admin/services${query || ''}`, payload, token),
    updateService: (id, payload, token, query) => put(`/api/admin/services/${id}${query || ''}`, payload, token),
    deleteService: (id, token, query) => remove(`/api/admin/services/${id}${query || ''}`, token),
    inquiries: (token, params) => get('/api/admin/inquiries', token, params),
    exportInquiries: (token) => get('/api/admin/inquiries/export/csv', token),
    inquiry: (id, token) => get(`/api/admin/inquiries/${id}`, token),
    updateInquiry: (id, payload, token) => patch(`/api/admin/inquiries/${id}`, payload, token),
    addInquiryNote: (id, payload, token) => post(`/api/admin/inquiries/${id}/notes`, payload, token),
    createQuotation: (id, payload, token) => post(`/api/admin/inquiries/${id}/quotations`, payload, token),
    sendQuotation: (id, token) => post(`/api/admin/quotations/${id}/send`, undefined, token),
    convertInquiryToBooking: (id, payload, token) => post(`/api/admin/inquiries/${id}/convert-booking`, payload, token),
    bookings: (token) => get('/api/admin/bookings', token),
    updateBooking: (id, payload, token) => patch(`/api/admin/bookings/${id}`, payload, token),
    recordPayment: (id, payload, token) => post(`/api/admin/bookings/${id}/payments`, payload, token),
    catalog: (token) => get('/api/admin/catalog', token),
    createPackage: (payload, token) => post('/api/admin/packages', payload, token),
    updatePackage: (id, payload, token) => put(`/api/admin/packages/${id}`, payload, token),
    deletePackage: (id, token) => remove(`/api/admin/packages/${id}`, token),
    createCategory: (payload, token) => post('/api/admin/categories', payload, token),
    createFoodItem: (payload, token) => post('/api/admin/food-items', payload, token),
    updateFoodItem: (id, payload, token) => put(`/api/admin/food-items/${id}`, payload, token),
    deleteFoodItem: (id, token) => remove(`/api/admin/food-items/${id}`, token),
    notifications: (token) => get('/api/admin/notifications', token),
    sendReminder: (payload, token) => post('/api/admin/notifications/reminder', payload, token),
    updateRestaurant: (payload, token) => patch('/api/admin/restaurant', payload, token),
    users: (token) => get('/api/admin/users', token),
    createUser: (payload, token) => post('/api/admin/users', payload, token),
    updateUser: (id, payload, token) => patch(`/api/admin/users/${id}`, payload, token),
    deleteUser: (id, token) => remove(`/api/admin/users/${id}`, token),
  },
  superadmin: {
    overview: (token) => get('/api/superadmin/overview', token),
    restaurants: (token) => get('/api/superadmin/restaurants', token),
    updateRestaurant: (id, payload, token) => patch(`/api/superadmin/restaurants/${id}`, payload, token),
    users: (token, params) => get('/api/superadmin/users', token, params),
    saveUser: (id, payload, token) => id
      ? patch(`/api/superadmin/users/${id}`, payload, token)
      : post('/api/superadmin/users', payload, token),
    updateUser: (id, payload, token) => patch(`/api/superadmin/users/${id}`, payload, token),
    deleteUser: (id, token) => remove(`/api/superadmin/users/${id}`, token),
    bookings: (token, params) => get('/api/superadmin/bookings', token, params),
    updateBooking: (id, payload, token) => patch(`/api/superadmin/bookings/${id}`, payload, token),
  },
};

export default api;
