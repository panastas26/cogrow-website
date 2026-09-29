const form = document.querySelector('#toast-intake');
const panels = [...form.querySelectorAll('.step-panel')];
const stepItems = [...document.querySelectorAll('.step-list li')];
const statusEl = document.querySelector('#form-status');
const submitButton = form.querySelector('button[type="submit"]');
const nextButton = document.querySelector('#next-step');
const backButton = document.querySelector('#back-step');
const filesInput = document.querySelector('#assets');
const fileList = document.querySelector('#file-list');
let currentStep = 0;
let siteKey;
let widgetId;
let renderingVerification = false;

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `form-status ${kind}`;
}

function validateFiles() {
  const files = [...filesInput.files];
  const hasFolder = Boolean(form.elements.namedItem('assetFolderUrl').value.trim());
  const allowed = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf', 'docx']);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const sizeAndTypeValid = files.length <= 12 && total <= 30 * 1024 * 1024 && files.every(file => file.size <= 8 * 1024 * 1024 && allowed.has(file.name.split('.').pop().toLowerCase()));
  const valid = sizeAndTypeValid && (files.length > 0 || hasFolder);
  fileList.textContent = valid
    ? (files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected · ${(total / 1048576).toFixed(1)} MB total` : 'Shared folder link added.')
    : (sizeAndTypeValid ? 'Add at least one file or a shared folder link.' : 'Choose up to 12 PNG, JPG, WebP, PDF or DOCX files, 8 MB each and 30 MB total.');
  fileList.className = valid ? 'hint' : 'hint error';
  return valid;
}

function updateReview() {
  const value = name => form.elements.namedItem(name).value.trim();
  document.querySelector('#review-restaurant').textContent = value('restaurantName') || 'Not provided';
  document.querySelector('#review-contact').textContent = `${value('contactName')} · ${value('email')}`;
  document.querySelector('#review-current').textContent = value('currentUrl') || 'Not provided';
  document.querySelector('#review-address').textContent = value('restaurantAddress') || 'Not provided';
  document.querySelector('#review-pages').textContent = value('pages') || 'To confirm together';
  document.querySelector('#review-action').textContent = form.elements.namedItem('primaryAction').selectedOptions[0]?.textContent || 'Not chosen';
  document.querySelector('#review-copy').textContent = value('pageCopy') || 'Provided through files or shared folder';
  document.querySelector('#review-links').textContent = value('toastLinks') || 'No active links provided';
  const count = filesInput.files.length;
  document.querySelector('#review-files').textContent = count ? `${count} file${count === 1 ? '' : 's'} selected` : (value('assetFolderUrl') ? 'Shared folder link provided' : 'No files selected');
  document.querySelector('#review-folder').textContent = value('assetFolderUrl') || 'Not provided';
  document.querySelector('#review-notes').textContent = value('notes') || 'None';
}

async function renderVerification() {
  if (!siteKey || widgetId !== undefined || renderingVerification || currentStep !== 3) return;
  renderingVerification = true;
  for (let i = 0; i < 40 && !window.turnstile; i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (!window.turnstile) {
    setStatus('Verification could not load. Please refresh the page.', 'error');
  } else {
    widgetId = window.turnstile.render('#turnstile', { sitekey: siteKey, theme: 'dark' });
    submitButton.disabled = false;
    setStatus('Ready when you are.');
  }
  renderingVerification = false;
}

function showStep(index) {
  currentStep = index;
  panels.forEach((panel, i) => { panel.hidden = i !== index; });
  stepItems.forEach((item, i) => { item.classList.toggle('current', i === index); });
  document.querySelector('#progress-label').textContent = `Step ${index + 1} of ${panels.length}`;
  document.querySelector('#progress-percent').textContent = `${Math.round((index + 1) / panels.length * 100)}%`;
  document.querySelector('#progress-fill').style.width = `${(index + 1) / panels.length * 100}%`;
  backButton.hidden = index === 0;
  nextButton.hidden = index === panels.length - 1;
  submitButton.hidden = index !== panels.length - 1;
  if (index === 3) {
    updateReview();
    renderVerification();
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(index) {
  const invalid = [...panels[index].querySelectorAll('input,textarea,select')].find(control => !control.checkValidity());
  if (invalid) {
    showStep(index);
    invalid.reportValidity();
    return false;
  }
  if (index === 2 && !validateFiles()) {
    showStep(index);
    return false;
  }
  return true;
}

nextButton.addEventListener('click', () => {
  if (validateStep(currentStep)) showStep(currentStep + 1);
});
backButton.addEventListener('click', () => showStep(currentStep - 1));
filesInput.addEventListener('change', validateFiles);
form.elements.namedItem('assetFolderUrl').addEventListener('input', validateFiles);

async function ready() {
  try {
    const response = await fetch('/api/toast-onboarding-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Intake is not available yet. Please email CoGrow for help.');
    const config = await response.json();
    if (!config.enabled || !config.siteKey) throw new Error('Intake is not ready yet. Please email CoGrow for help.');
    siteKey = config.siteKey;
    renderVerification();
  } catch (error) {
    setStatus(error.message || 'Intake is unavailable. Please email CoGrow for help.', 'error');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (currentStep !== 3) {
    if (validateStep(currentStep)) showStep(currentStep + 1);
    return;
  }
  for (let i = 0; i < panels.length; i++) {
    if (!validateStep(i)) return;
  }
  showStep(3);
  if (!window.turnstile?.getResponse(widgetId)) {
    setStatus('Complete the verification before sending.', 'error');
    return;
  }
  submitButton.disabled = true;
  setStatus('Uploading your materials. Please keep this page open.');
  try {
    const response = await fetch('/api/toast-onboarding', { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Upload failed. Please try again.');
    form.innerHTML = `<div class="complete"><p class="mono lime">Received</p><h2>We have your materials.</h2><p>Save this reference number: <strong>${result.reference}</strong>. We'll review your submission and follow up about Toast access and next steps.</p></div>`;
  } catch (error) {
    setStatus(error.message || 'Upload failed. Please try again.', 'error');
    window.turnstile?.reset(widgetId);
    submitButton.disabled = false;
  }
});

ready();
