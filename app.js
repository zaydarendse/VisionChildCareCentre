// ─────────────────────────────────────────────────────────────────────
// CONFIG — paste your Apps Script Web App /exec URL here after deploying
// ─────────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx61az3p6AVZ5DJ-BYAjYeRsZYzEmkPFPm8wy-jRoXR02ghe6rAgFOoUTNw8wiyKe_5/exec';

const STORAGE_KEY = 'visionchildandyouthcarecentre@gmail.com';

// ─────────────────────────────────────────────────────────────────────
// API HELPERS
// Notes on CORS: GET requests and POST requests with a text/plain body
// (no custom headers) avoid the CORS preflight that Apps Script can't
// answer, and Apps Script's response comes back readable — no need for
// the mode:'no-cors' blind-send workaround here.
// ─────────────────────────────────────────────────────────────────────

async function apiGet(action, params) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.keys(params || {}).forEach((k) => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(action, data) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, data))
  });
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
// VIEW ROUTING
// ─────────────────────────────────────────────────────────────────────

const views = ['auth', 'pending', 'rejected', 'manager', 'submitted', 'admin', 'backoffice', 'loading'];
function showView(name) {
  views.forEach((v) => {
    document.getElementById('view-' + v).hidden = (v !== name);
  });
}

let currentUser = null; // { email, fullName, role, branch }

document.getElementById('switchUserBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  currentUser = null;
  document.getElementById('whoami').textContent = '';
  document.getElementById('switchUserBtn').hidden = true;
  document.getElementById('authEmail').value = '';
  document.getElementById('registerFields').hidden = true;
  showView('auth');
});

async function init() {
  showView('loading');
  const savedEmail = localStorage.getItem(STORAGE_KEY);
  if (!savedEmail) {
    await loadBranchesIntoSelect('regBranch');
    showView('auth');
    return;
  }
  await routeForEmail(savedEmail);
}

async function routeForEmail(email) {
  showView('loading');
  const result = await apiGet('checkUser', { email: email });
  if (!result.success) {
    showAuthError(result.error || 'Something went wrong.');
    showView('auth');
    return;
  }
  if (!result.found) {
    localStorage.removeItem(STORAGE_KEY);
    await loadBranchesIntoSelect('regBranch');
    document.getElementById('authEmail').value = email;
    document.getElementById('registerFields').hidden = false;
    showView('auth');
    return;
  }

  localStorage.setItem(STORAGE_KEY, email);
  currentUser = result;
  document.getElementById('whoami').textContent = result.fullName + ' (' + (result.role || 'pending') + ')';
  document.getElementById('switchUserBtn').hidden = false;

  if (result.status === 'Pending') {
    document.getElementById('pendingName').textContent = result.fullName;
    showView('pending');
  } else if (result.status === 'Rejected') {
    showView('rejected');
  } else if (result.status === 'Approved' && result.role === 'Manager') {
    setupManagerView(result);
    showView('manager');
  } else if (result.status === 'Approved' && result.role === 'Admin') {
    await loadAdminView(result.email);
    showView('admin');
  } else if (result.status === 'Approved' && result.role === 'BackOffice') {
    await (result);
    showView('backoffice');
  } else {
    showAuthError('Your account has an unrecognised status. Please contact an admin.');
    showView('auth');
  }
}

function showAuthError(msg) {
  document.getElementById('authError').textContent = msg;
}

// ─────────────────────────────────────────────────────────────────────
// AUTH / REGISTER VIEW
// ─────────────────────────────────────────────────────────────────────

document.getElementById('authContinueBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  showAuthError('');
  if (!email) { showAuthError('Please enter your email.'); return; }
  await routeForEmail(email);
});

document.getElementById('registerBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const fullName = document.getElementById('regFullName').value.trim();
  const contact = document.getElementById('regContact').value.trim();
  const requestedBranch = document.getElementById('regBranch').value;
  showAuthError('');
  if (!email || !fullName || !contact) {
    showAuthError('Full name, contact number and email are all required.');
    return;
  }
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Registering…';
  const result = await apiPost('register', { email, fullName, contact, requestedBranch });
  btn.disabled = false; btn.textContent = 'Register';
  if (!result.success) {
    showAuthError(result.error || 'Registration failed.');
    return;
  }
  localStorage.setItem(STORAGE_KEY, email);
  document.getElementById('pendingName').textContent = fullName;
  showView('pending');
});

async function loadBranchesIntoSelect(selectId) {
  const result = await apiGet('branches', {});
  const select = document.getElementById(selectId);
  select.innerHTML = '';
  if (result.success) {
    result.branches.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      select.appendChild(opt);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// MANAGER CASH-UP FORM
// ─────────────────────────────────────────────────────────────────────

const DENOMS = [
  { id: 'r200', value: 200 }, { id: 'r100', value: 100 }, { id: 'r50', value: 50 },
  { id: 'r20', value: 20 }, { id: 'r10', value: 10 }, { id: 'r5', value: 5 },
  { id: 'r2', value: 2 }, { id: 'r1', value: 1 }, { id: 'c5', value: 0.05 }, { id: 'c1', value: 0.01 }
];

function setupManagerView(user) {
  document.getElementById('mBranch').value = user.branch;
  if (!document.getElementById('mCasher').value) {
    document.getElementById('mCasher').value = user.fullName;
  }
  if (!document.getElementById('mDate').value) {
    document.getElementById('mDate').value = new Date().toISOString().slice(0, 10);
  }
  document.getElementById('managerName').value = document.getElementById('managerName').value || '';
  recalcAll();
}

function num(id) { return Number(document.getElementById(id).value) || 0; }
function rand(v) { return 'R ' + Number(v).toFixed(2); }

function recalcAll() {
  const totalNettSales = num('grossSales') - num('overingPaidAmount') - num('cashRefundsAmount') - num('expensePaidAmount');
  document.getElementById('totalNettSales').textContent = rand(totalNettSales);

  let totalCashOnly = 0;
  DENOMS.forEach((d) => {
    const count = num(d.id);
    const sub = count * d.value;
    totalCashOnly += sub;
    document.getElementById('sub-' + d.id).textContent = rand(sub);
  });
  document.getElementById('totalCashOnly').textContent = rand(totalCashOnly);

  const totalCardsAndCash = totalCashOnly + num('totalCardSales');
  document.getElementById('totalCardsAndCash').textContent = rand(totalCardsAndCash);

  const shortOver = totalCardsAndCash - totalNettSales;
  const shortOverEl = document.getElementById('shortOverAmount');
  shortOverEl.textContent = rand(shortOver);
  shortOverEl.className = shortOver < 0 ? 'short-negative' : (shortOver > 0 ? 'short-positive' : '');

  recalcDonations();
}

function recalcDonations() {
  let total = 0;
  document.querySelectorAll('#donationsBody tr').forEach((row) => {
    total += Number(row.querySelector('.don-amount').value) || 0;
  });
  document.getElementById('totalDonations').textContent = rand(total);
}

['grossSales', 'overingPaidAmount', 'cashRefundsAmount', 'expensePaidAmount', 'totalCardSales',
  'r200', 'r100', 'r50', 'r20', 'r10', 'r5', 'r2', 'r1', 'c5', 'c1'
].forEach((id) => {
  document.getElementById(id).addEventListener('input', recalcAll);
});

let donationRowCount = 0;
function addDonationRow() {
  donationRowCount++;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="text" class="don-receipt"></td>' +
    '<td><input type="number" step="0.01" class="don-amount" value="0"></td>' +
    '<td><input type="date" class="don-date"></td>' +
    '<td><button type="button" class="row-remove">✕</button></td>';
  tr.querySelector('.don-amount').addEventListener('input', recalcDonations);
  tr.querySelector('.row-remove').addEventListener('click', () => { tr.remove(); recalcDonations(); });
  document.getElementById('donationsBody').appendChild(tr);
}
document.getElementById('addDonationBtn').addEventListener('click', addDonationRow);

document.getElementById('submitCashUpBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('submitError');
  errEl.textContent = '';

  if (!document.getElementById('zReadingNo').value || !document.getElementById('grossSales').value) {
    errEl.textContent = 'Z Reading No. and Gross Sales are required.';
    return;
  }
  if (!document.getElementById('managerName').value) {
    errEl.textContent = 'Manager sign-off name is required.';
    return;
  }

  const donations = [];
  document.querySelectorAll('#donationsBody tr').forEach((row) => {
    const amount = Number(row.querySelector('.don-amount').value) || 0;
    const receiptNo = row.querySelector('.don-receipt').value;
    const receiptDate = row.querySelector('.don-date').value;
    if (amount > 0 || receiptNo) {
      donations.push({ receiptNo, amount, receiptDate });
    }
  });

  const data = {
    branch: document.getElementById('mBranch').value,
    date: document.getElementById('mDate').value,
    day: new Date(document.getElementById('mDate').value).toLocaleDateString('en-ZA', { weekday: 'long' }),
    casher: document.getElementById('mCasher').value,
    zReadingNo: document.getElementById('zReadingNo').value,
    grossSales: num('grossSales'),
    overingPaidAmount: num('overingPaidAmount'),
    cashRefundsAmount: num('cashRefundsAmount'),
    expensePaidAmount: num('expensePaidAmount'),
    cardSalesCount: num('cardSalesCount'),
    totalCardSales: num('totalCardSales'),
    r200: num('r200'), r100: num('r100'), r50: num('r50'), r20: num('r20'), r10: num('r10'),
    r5: num('r5'), r2: num('r2'), r1: num('r1'), c5: num('c5'), c1: num('c1'),
    overingExplain: document.getElementById('overingExplain').value,
    refundsExplain: document.getElementById('refundsExplain').value,
    expensesExplain: document.getElementById('expensesExplain').value,
    shortOverExplain: document.getElementById('shortOverExplain').value,
    managerName: document.getElementById('managerName').value,
    donations: donations
  };

  const btn = document.getElementById('submitCashUpBtn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  const result = await apiPost('submitCashUp', { submittedByEmail: currentUser.email, data: data });
  btn.disabled = false; btn.textContent = 'Submit Cash-Up';

  if (!result.success) {
    errEl.textContent = result.error || 'Submission failed. Please try again.';
    return;
  }
  document.getElementById('submittedRef').textContent = 'Reference: ' + result.submissionId +
    (result.pdfWarning ? ' — note: ' + result.pdfWarning : '');
  showView('submitted');
});

document.getElementById('newCashUpBtn').addEventListener('click', () => {
  document.querySelectorAll('#view-manager input[type=number]').forEach((i) => { i.value = 0; });
  document.getElementById('zReadingNo').value = '';
  document.getElementById('grossSales').value = '';
  document.getElementById('totalCardSales').value = 0;
  document.getElementById('overingExplain').value = '';
  document.getElementById('refundsExplain').value = '';
  document.getElementById('expensesExplain').value = '';
  document.getElementById('shortOverExplain').value = '';
  document.getElementById('donationsBody').innerHTML = '';
  document.getElementById('mDate').value = new Date().toISOString().slice(0, 10);
  recalcAll();
  showView('manager');
});

// ─────────────────────────────────────────────────────────────────────
// ADMIN VIEW
// ─────────────────────────────────────────────────────────────────────

async function loadAdminView(adminEmail) {
  const result = await apiGet('pendingUsers', { email: adminEmail });
  const listEl = document.getElementById('pendingList');
  const noneEl = document.getElementById('noPending');
  listEl.innerHTML = '';

  if (!result.success) {
    listEl.innerHTML = '<p class="error-text">' + result.error + '</p>';
    return;
  }
  if (result.pending.length === 0) {
    noneEl.hidden = false;
    return;
  }
  noneEl.hidden = true;

  result.pending.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'pending-row';
    const branchOptions = result.branches.map((b) =>
      '<option value="' + b + '"' + (b === p.requestedBranch ? ' selected' : '') + '>' + b + '</option>'
    ).join('');
    div.innerHTML =
      '<div class="name">' + escapeHtml(p.fullName) + '</div>' +
      '<div class="muted">' + escapeHtml(p.contact) + ' · ' + escapeHtml(p.email) + '</div>' +
      '<div class="muted">Requested branch: ' + escapeHtml(p.requestedBranch || '—') + '</div>' +
      '<div class="pending-actions">' +
        '<select class="role-select"><option value="Manager">Store Manager</option><option value="BackOffice">Back Office</option><option value="Admin">Admin</option></select>' +
        '<select class="branch-select">' + branchOptions + '</select>' +
        '<button class="btn-approve">Approve</button>' +
        '<button class="btn-reject">Reject</button>' +
      '</div>';

    div.querySelector('.btn-approve').addEventListener('click', async () => {
      const role = div.querySelector('.role-select').value;
      const branch = div.querySelector('.branch-select').value;
      div.querySelector('.btn-approve').disabled = true;
      const res = await apiPost('approveUser', { requesterEmail: adminEmail, targetEmail: p.email, role, branch });
      if (res.success) { div.remove(); } else { alert(res.error); div.querySelector('.btn-approve').disabled = false; }
    });
    div.querySelector('.btn-reject').addEventListener('click', async () => {
      if (!confirm('Reject ' + p.fullName + '\'s registration?')) return;
      div.querySelector('.btn-reject').disabled = true;
      const res = await apiPost('rejectUser', { requesterEmail: adminEmail, targetEmail: p.email });
      if (res.success) { div.remove(); } else { alert(res.error); div.querySelector('.btn-reject').disabled = false; }
    });

    listEl.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────────────
// BACK OFFICE VIEW
// ─────────────────────────────────────────────────────────────────────

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
         pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

async function loadBackOfficeView(user) {
  const result = await apiGet('recentSubmissions', { email: user.email, branch: user.branch });
  const listEl = document.getElementById('recentList');
  listEl.innerHTML = '';
  if (!result.success) { listEl.innerHTML = '<p class="error-text">' + result.error + '</p>'; return; }
  result.submissions.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'recent-row';
    div.innerHTML =
      '<span>' + escapeHtml(s.branch) + ' — ' + escapeHtml(s.date) + '</span>' +
      '<span>' + (s.pdfUrl ? '<a href="' + s.pdfUrl + '" target="_blank">PDF</a>' : '') + '</span>';
    listEl.appendChild(div);
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// ─────────────────────────────────────────────────────────────────────
init();
