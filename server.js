require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadProducts() {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf-8');
  return JSON.parse(raw);
}

app.get('/api/products', (req, res) => {
  try {
    res.json(loadProducts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не вдалося завантажити товари' });
  }
});

// Формує текст замовлення для Telegram
function buildTelegramMessage(order, items, total) {
  const lines = items.map((i) => {
    if (i.type === 'subscription') {
      return `• ${i.name} (${i.flavor}) — підписка на ${i.months} міс. — ${i.lineTotal} грн`;
    }
    return `• ${i.name} (${i.flavor}, ${i.weight}) — ${i.qty} шт. — ${i.lineTotal} грн`;
  });

  return [
    '🛒 *Нове замовлення*',
    '',
    ...lines,
    '',
    `*Разом: ${total} грн*`,
    '',
    `👤 Ім'я: ${order.name}`,
    `📞 Телефон: ${order.phone}`,
    order.address ? `📍 Адреса: ${order.address}` : null,
    order.comment ? `💬 Коментар: ${order.comment}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendToTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('Telegram не налаштований — пропускаю відправку. Додайте TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID у .env');
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API помилка: ${res.status} ${body}`);
  }
}

app.post('/api/order', async (req, res) => {
  try {
    const { customer, items } = req.body;

    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: "Вкажіть ім'я та телефон" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Кошик порожній' });
    }

    const products = loadProducts();
    let total = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.id);
      if (!product) {
        return res.status(400).json({ error: `Товар ${item.id} не знайдено` });
      }

      const flavor = product.flavors.includes(item.flavor) ? item.flavor : product.flavors[0];

      if (item.type === 'subscription') {
        if (!product.subscription || !product.subscription.available) {
          return res.status(400).json({ error: `${product.name} недоступний як підписка` });
        }
        const months = Math.max(1, parseInt(item.months, 10) || 1);
        const lineTotal = product.subscription.pricePerMonth * months;
        total += lineTotal;
        resolvedItems.push({ name: product.name, flavor, type: 'subscription', months, lineTotal });
      } else {
        const weightOpt = product.weights.find((w) => w.label === item.weight) || product.weights[0];
        const qty = Math.max(1, parseInt(item.qty, 10) || 1);
        const lineTotal = weightOpt.price * qty;
        total += lineTotal;
        resolvedItems.push({ name: product.name, flavor, weight: weightOpt.label, type: 'onetime', qty, lineTotal });
      }
    }

    const orderId = `ORD-${Date.now()}`;
    const message = buildTelegramMessage(customer, resolvedItems, total);

    await sendToTelegram(message);

    // TODO: тут буде створення платежу через Monobank Acquiring API
    // і повернення посилання на оплату замість негайного успіху.

    res.json({ success: true, orderId, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не вдалося оформити замовлення. Спробуйте ще раз.' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});
