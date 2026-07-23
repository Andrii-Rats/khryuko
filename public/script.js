let products = [];
// cart: { id, name, flavor, type: 'onetime'|'subscription', weight, price, qty, months, pricePerMonth }
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
// selection state per product card: { flavor, weightIdx, qty, subMonths }
const selection = {};

const grid = document.getElementById('productGrid');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const cartCountEl = document.getElementById('cartCount');
const checkoutBtn = document.getElementById('checkoutBtn');

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }
function money(n) { return `${n} грн`; }

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    products = await res.json();
    products.forEach((p) => {
      selection[p.id] = { flavor: p.flavors[0], weightIdx: 0, qty: 1, subMonths: 1 };
    });
    renderProducts();
  } catch (err) {
    grid.innerHTML = '<p class="loading">Не вдалося завантажити товари. Оновіть сторінку.</p>';
  }
}

function renderProducts() {
  grid.innerHTML = '';
  products.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = p.id;
    card.appendChild(buildCard(p));
    grid.appendChild(card);
  });
}

function buildCard(p) {
  const sel = selection[p.id];
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';

  const flavorPills = p.flavors.map((f) => (
    `<button class="pill flavor-pill ${f === sel.flavor ? 'selected' : ''}" data-flavor="${f}">${f}</button>`
  )).join('');

  const weightPills = p.weights.map((w, i) => (
    `<button class="pill weight-pill ${i === sel.weightIdx ? 'selected' : ''}" data-weight-idx="${i}">${w.label}</button>`
  )).join('');

  const currentPrice = p.weights[sel.weightIdx].price;

  const sub = p.subscription && p.subscription.available
    ? `
      <div class="subscription-option">
        <label>Підписка
          <input type="number" min="1" value="${sel.subMonths}" class="sub-months">
          міс.
        </label>
        <span class="sub-price">${money(p.subscription.pricePerMonth)}/міс · ${p.subscription.note}</span>
        <button class="btn btn-sub sub-btn">Підписатись</button>
      </div>`
    : '';

  wrapper.innerHTML = `
    <span class="product-category">${p.category}</span>
    <h3 class="product-name">${p.name}</h3>

    <div class="option-group">
      <span class="option-label">Смак</span>
      <div class="pill-row flavor-row">${flavorPills}</div>
    </div>

    <div class="option-group">
      <span class="option-label">Фасування</span>
      <div class="pill-row weight-row">${weightPills}</div>
    </div>

    <div class="product-price">${money(currentPrice)}</div>

    <div class="product-actions">
      <div class="qty-control">
        <button class="qty-btn" data-action="dec">−</button>
        <span class="qty-value">${sel.qty}</span>
        <button class="qty-btn" data-action="inc">+</button>
      </div>
      <button class="btn btn-outline add-cart-btn">У кошик</button>
    </div>
    ${sub}
  `;
  return wrapper;
}

function rerenderCard(id) {
  const card = grid.querySelector(`.product-card[data-id="${id}"]`);
  const p = products.find((x) => x.id === id);
  card.innerHTML = '';
  card.appendChild(buildCard(p));
}

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card');
  if (!card) return;
  const id = card.dataset.id;
  const sel = selection[id];
  const p = products.find((x) => x.id === id);
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.classList.contains('flavor-pill')) {
    sel.flavor = btn.dataset.flavor;
    rerenderCard(id);
    return;
  }
  if (btn.classList.contains('weight-pill')) {
    sel.weightIdx = parseInt(btn.dataset.weightIdx, 10);
    rerenderCard(id);
    return;
  }
  if (btn.dataset.action === 'inc' || btn.dataset.action === 'dec') {
    sel.qty = btn.dataset.action === 'inc' ? sel.qty + 1 : Math.max(1, sel.qty - 1);
    rerenderCard(id);
    return;
  }
  if (btn.classList.contains('add-cart-btn')) {
    const weight = p.weights[sel.weightIdx];
    addToCart(p, 'onetime', { flavor: sel.flavor, weight: weight.label, price: weight.price, qty: sel.qty });
    return;
  }
  if (btn.classList.contains('sub-btn')) {
    const monthsInput = card.querySelector('.sub-months');
    const months = Math.max(1, parseInt(monthsInput.value, 10) || 1);
    addToCart(p, 'subscription', { flavor: sel.flavor, pricePerMonth: p.subscription.pricePerMonth, months });
  }
});

function addToCart(product, type, opts) {
  if (type === 'onetime') {
    const existing = cart.find((c) => c.id === product.id && c.type === 'onetime' && c.flavor === opts.flavor && c.weight === opts.weight);
    if (existing) {
      existing.qty += opts.qty;
    } else {
      cart.push({ id: product.id, name: product.name, type, flavor: opts.flavor, weight: opts.weight, price: opts.price, qty: opts.qty });
    }
  } else {
    const existing = cart.find((c) => c.id === product.id && c.type === 'subscription' && c.flavor === opts.flavor);
    if (existing) {
      existing.months = opts.months;
    } else {
      cart.push({ id: product.id, name: product.name, type, flavor: opts.flavor, pricePerMonth: opts.pricePerMonth, months: opts.months });
    }
  }
  saveCart();
  renderCart();
  openCart();
}

function renderCart() {
  cartItemsEl.innerHTML = '';

  if (cart.length === 0) {
    cartItemsEl.innerHTML = '<p class="cart-empty">Кошик порожній.</p>';
  }

  let total = 0;
  cart.forEach((item, idx) => {
    const lineTotal = item.type === 'subscription' ? item.pricePerMonth * item.months : item.price * item.qty;
    total += lineTotal;

    const meta = item.type === 'subscription'
      ? `Підписка (${item.flavor}) · ${item.months} міс. · ${money(lineTotal)}`
      : `${item.flavor}, ${item.weight} · ${item.qty} шт · ${money(lineTotal)}`;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-meta">${meta}</p>
      </div>
      <div class="cart-item-actions">
        <button class="remove-btn" data-idx="${idx}" aria-label="Видалити">✕</button>
      </div>
    `;
    cartItemsEl.appendChild(row);
  });

  cartTotalEl.textContent = money(total);
  cartCountEl.textContent = cart.length;
  checkoutBtn.disabled = cart.length === 0;
}

cartItemsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-btn');
  if (!btn) return;
  cart.splice(parseInt(btn.dataset.idx, 10), 1);
  saveCart();
  renderCart();
});

const cartDrawer = document.getElementById('cartDrawer');
const overlay = document.getElementById('overlay');

function openCart() { cartDrawer.classList.add('open'); overlay.classList.add('visible'); }
function closeCart() { cartDrawer.classList.remove('open'); overlay.classList.remove('visible'); }
document.getElementById('cartBtn').addEventListener('click', openCart);
document.getElementById('closeCart').addEventListener('click', closeCart);
overlay.addEventListener('click', () => { closeCart(); closeModal(); });

const modal = document.getElementById('checkoutModal');
const orderForm = document.getElementById('orderForm');
const orderSuccess = document.getElementById('orderSuccess');

function openModal() {
  orderForm.hidden = false;
  orderSuccess.hidden = true;
  modal.classList.add('open');
  overlay.classList.add('visible');
}
function closeModal() {
  modal.classList.remove('open');
  if (!cartDrawer.classList.contains('open')) overlay.classList.remove('visible');
}

checkoutBtn.addEventListener('click', () => { closeCart(); openModal(); });
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('closeSuccess').addEventListener('click', () => {
  closeModal();
  overlay.classList.remove('visible');
});

orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(orderForm);
  const customer = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    comment: formData.get('comment'),
  };

  const items = cart.map((item) => (
    item.type === 'subscription'
      ? { id: item.id, type: 'subscription', flavor: item.flavor, months: item.months }
      : { id: item.id, type: 'onetime', flavor: item.flavor, weight: item.weight, qty: item.qty }
  ));

  const submitBtn = document.getElementById('submitOrder');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Надсилаємо…';

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer, items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка замовлення');

    cart = [];
    saveCart();
    renderCart();
    orderForm.hidden = true;
    orderSuccess.hidden = false;
    orderForm.reset();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Підтвердити замовлення';
  }
});

loadProducts();
renderCart();
