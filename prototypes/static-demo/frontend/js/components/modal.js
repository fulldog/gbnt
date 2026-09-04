function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
}

document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeAllModals();
});
