/* ============================================================
   PerúPay - DEMO QA · Lógica de la app
   ============================================================
   Esta app contiene DEFECTOS INTENCIONADOS para que la clase
   de Calidad de Software los descubra. Los bugs están marcados
   con un código:

      [BUG #VAL-n]   Validación de entradas
      [BUG #SEC-n]   Seguridad
      [BUG #EST-n]   Estado / concurrencia
      [BUG #UX-n]    Usabilidad / UI
      [BUG #LOG-n]   Lógica de negocio
      [BUG #DAT-n]   Sincronización de datos
      [BUG #A11Y-n]  Accesibilidad

   ============================================================ */

/* ============================================================
   PERSISTENCIA · localStorage
   ============================================================ */

const STORAGE_KEY = 'pp_state_v1';
const SESSION_KEY = 'pp_session_v1';

function getDefaultState(){
  return {
    profile: {
      name:        "Diego Ramírez",
      dni:         "70125421",
      email:       "diego.ramirez@perupay.pe",
      phone:       "987654321",
      account:     "00112-345-6789014471",
      lastDigits:  "4471",
      initials:    "DR"
    },
    saldo: 2450.75,
    txHistory: [
      { who:"Sueldo abril",     amount:+3200.00, status:"ok",      date:"01 abr, 09:00",  icon:"in"  },
      { who:"Luz del Sur",      amount:-112.40,  status:"ok",      date:"12 abr, 11:08",  icon:"out" },
      { who:"Sedapal",          amount:-58.20,   status:"ok",      date:"15 abr, 10:22",  icon:"out" },
      { who:"Carlos Ríos",      amount:-200.00,  status:"pending", date:"22 abr, 16:48",  icon:"out" },
      { who:"Pedro Quispe",     amount:-30.00,   status:"fail",    date:"08 abr, 21:55",  icon:"out" },
      { who:"Netflix Perú",     amount:-44.90,   status:"ok",      date:"Ayer, 12:01",    icon:"out" },
      { who:"María Fernández",  amount:-85.50,   status:"ok",      date:"Ayer, 19:33",    icon:"out" },
      { who:"Recarga Yape",     amount:+150.00,  status:"ok",      date:"Hoy, 08:12",     icon:"in"  }
    ],
    cards: [
      { id:1, brand:"visa",   num:"4532 1234 5678 9012", name:"Diego Ramírez", exp:"08/27" },
      { id:2, brand:"master", num:"5555 4444 3333 2222", name:"Diego Ramírez", exp:"03/29" }
    ]
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    // merge con defaults para tolerar versiones viejas en localStorage
    const def = getDefaultState();
    return {
      profile:   { ...def.profile, ...(parsed.profile || {}) },
      saldo:     typeof parsed.saldo === 'number' ? parsed.saldo : def.saldo,
      txHistory: Array.isArray(parsed.txHistory) ? parsed.txHistory : def.txHistory,
      cards:     Array.isArray(parsed.cards)     ? parsed.cards     : def.cards
    };
  } catch(e) {
    return getDefaultState();
  }
}

function persist(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profile, saldo, txHistory, cards
    }));
  } catch(e){
    console.error("No se pudo guardar el estado:", e);
  }
}

function resetData(){
  if (!confirm("¿Restablecer todos los datos a los valores iniciales? Se perderán transferencias y tarjetas agregadas.")) return;
  localStorage.removeItem(STORAGE_KEY);
  const fresh = getDefaultState();
  profile   = fresh.profile;
  saldo     = fresh.saldo;
  txHistory = fresh.txHistory;
  cards     = fresh.cards;
  persist();
  renderAll();
  showToast("Datos restablecidos");
}

/* ---------- ESTADO GLOBAL EN MEMORIA ---------- */
let _state = loadState();
let profile   = _state.profile;
let saldo     = _state.saldo;
let txHistory = _state.txHistory;
let cards     = _state.cards;

let pendingTransfer = null;
let isProcessing    = false;
let currentMovFilter = "all";
let loginTabType     = "dni";
let selectedService  = null;

/* ============================================================
   1. LOGIN
   ============================================================ */

function setLoginTab(type){
  loginTabType = type;
  document.getElementById('tab-dni').classList.toggle('active', type==='dni');
  document.getElementById('tab-email').classList.toggle('active', type==='email');
  document.getElementById('lbl-user').textContent = type==='dni' ? 'DNI' : 'Email';
  document.getElementById('loginUser').placeholder = type==='dni' ? 'Ingresa tu DNI' : 'tu@correo.com';
}

function doLogin(){
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;

  // [BUG #SEC-2] Backdoor de demo olvidado: si user === "admin" se ignora
  // completamente la contraseña.
  if (user === "admin") {
    showToast("Bienvenido, administrador");
    enterApp(true);
    return;
  }

  // [BUG #VAL-1] La contraseña mínima son 4 caracteres (debería ser >=8).
  if (!user || pass.length < 4) {
    // [BUG #UX-2] El mensaje no distingue si falla user o password.
    showToast("Credenciales inválidas", true);
    return;
  }

  // [BUG #VAL-2] El DNI peruano tiene 8 dígitos. Esta regex acepta 5 a 12.
  if (loginTabType === 'dni' && !/^\d{5,12}$/.test(user)) {
    showToast("DNI inválido", true);
    return;
  }

  // [BUG #VAL-3] Email regex incorrecta: acepta "abc@" sin dominio ni TLD.
  if (loginTabType === 'email' && !/^.+@.*$/.test(user)) {
    showToast("Email inválido", true);
    return;
  }

  // [BUG #SEC-3] Password guardado en localStorage en texto plano,
  // junto con el usuario.
  localStorage.setItem('pp_user', user);
  localStorage.setItem('pp_pass', pass);

  // sesión "real" - registra fecha de último acceso
  const session = {
    user,
    type:        loginTabType,
    loggedAt:    new Date().toISOString(),
    lastAccess:  localStorage.getItem('pp_last_access') || null
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('pp_last_access', session.loggedAt);

  enterApp(true);
}

function enterApp(showWelcome){
  goTo('screen-home');
  renderAll();
  if (showWelcome) openWelcome();
}

function logout(){
  // [BUG #SEC-4] No limpia localStorage al cerrar sesión:
  // los datos del estado y el password quedan persistidos.
  goTo('screen-login');
  showToast("Sesión cerrada");
}

// [BUG #SEC-5] Auto-login eterno: si quedó algo en localStorage,
// la sesión nunca expira (no hay token con TTL).
(function autoLogin(){
  if (localStorage.getItem('pp_user')) {
    setTimeout(() => enterApp(true), 50);
  }
})();

/* ============================================================
   2. WELCOME MODAL · "Tus datos al iniciar sesión"
   ============================================================ */

function openWelcome(){
  const modal = document.getElementById('welcomeModal');
  if (!modal) return;

  // Datos iniciales actuales (siempre coherentes con el estado en memoria)
  document.getElementById('welName').textContent    = (profile.name || 'Cliente').split(' ')[0];
  document.getElementById('welSaldo').textContent   = formatSoles(saldo);
  document.getElementById('welAccount').textContent = '•••• ' + (profile.lastDigits || '----');
  document.getElementById('welDni').textContent     = '••••' + (profile.dni || '').slice(-4);
  document.getElementById('welEmail').textContent   = profile.email || '—';
  document.getElementById('welTxCount').textContent = txHistory.length;
  document.getElementById('welCards').textContent   = cards.length;

  const lastAccess = (() => {
    try{
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      if (s.lastAccess) {
        const d = new Date(s.lastAccess);
        return d.toLocaleString('es-PE', { dateStyle:'medium', timeStyle:'short' });
      }
    } catch(e) {}
    return 'primer ingreso';
  })();
  document.getElementById('welLast').textContent = 'Último acceso: ' + lastAccess;

  modal.hidden = false;
}

function closeWelcome(){
  const modal = document.getElementById('welcomeModal');
  if (modal) modal.hidden = true;
}

/* ============================================================
   3. NAVEGACIÓN
   ============================================================ */

function goTo(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  // sincroniza sidebar (sólo visual)
  document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.side-link[data-screen="${id}"]`);
  if (link) link.classList.add('active');

  if (id === 'screen-home') {
    renderTx();
    renderHomeChrome();
    // [BUG #DAT-2] Al volver al home NO se actualiza el saldo en el DOM:
    // queda fijo el último valor renderizado aunque `saldo` haya cambiado
    // tras una transferencia.
    // Falta intencional:
    // document.getElementById('saldoView').textContent = formatNumber(saldo);
  }
  if (id === 'screen-transfer') {
    document.getElementById('amount').value = '';
    document.getElementById('destAccount').value = '';
    document.getElementById('desc').value = '';
  }
  if (id === 'screen-cards')     renderCards();
  if (id === 'screen-movements') renderMovements();
  if (id === 'screen-profile')   renderProfileForm();
}

/* ============================================================
   4. TOAST
   ============================================================ */

function showToast(msg, isError=false){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  // [BUG #UX-4] Toast desaparece a los 2.8s incluso para errores críticos.
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ============================================================
   5. FORMATO
   ============================================================ */

function formatNumber(n){
  // separador de miles + 2 decimales
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function formatSoles(n){
  return 'S/ ' + formatNumber(n);
}

/* ============================================================
   6. HOME · datos iniciales coherentes
   ============================================================ */

function renderHomeChrome(){
  // saldo del balance card
  const saldoView = document.getElementById('saldoView');
  if (saldoView) saldoView.textContent = formatNumber(saldo);

  // saludo del header (móvil)
  const hello = document.getElementById('helloUser');
  if (hello) {
    const first = (profile.name || 'Cliente').split(' ')[0];
    hello.textContent = `Hola, ${first} ✨`;
  }

  // Resumen del mes (aside) - ahora dinámico a partir de txHistory
  renderMonthlySummary();
}

function renderMonthlySummary(){
  const aside = document.querySelector('.aside');
  if (!aside) return;

  const completados = txHistory.filter(t => t.status === 'ok');
  const ingresos    = completados.filter(t => t.amount > 0).reduce((a,t) => a + t.amount, 0);
  const egresos     = completados.filter(t => t.amount < 0).reduce((a,t) => a + Math.abs(t.amount), 0);
  const totalTx     = txHistory.length;
  const pendientes  = txHistory.filter(t => t.status === 'pending').length;

  const stats = aside.querySelector('.aside-card:nth-of-type(2)');
  if (stats) {
    stats.innerHTML = `
      <h3>Resumen del mes</h3>
      <div class="stat-row"><span class="k">Ingresos</span><span class="v" style="color:var(--ok)">+ ${formatSoles(ingresos)}</span></div>
      <div class="stat-row"><span class="k">Egresos</span><span class="v" style="color:var(--danger)">- ${formatSoles(egresos)}</span></div>
      <div class="stat-row"><span class="k">Movimientos</span><span class="v">${totalTx}</span></div>
      <div class="stat-row"><span class="k">Pendientes</span><span class="v" style="color:var(--pending)">${pendientes}</span></div>
    `;
  }
}

function renderTx(){
  const list = document.getElementById('txList');
  if (!list) return;
  list.innerHTML = '';
  txHistory.slice(0, 5).forEach(t => {
    const sign = t.amount >= 0 ? '+' : '-';
    // [BUG #UX-5] Formato de monto inconsistente: aquí no hay separador
    // de miles, pero el balance card sí lo lleva (2,450.75).
    const amt = Math.abs(t.amount).toFixed(2);

    // [BUG #UX-6] Pendientes aparecen con el mismo color que completadas;
    // sólo cambia el pill (poco visible).
    const cls = t.amount >= 0 ? 'in' : 'out';

    let pill = '';
    if (t.status === 'ok')      pill = '<span class="status-pill pill-ok">Completada</span>';
    if (t.status === 'pending') pill = '<span class="status-pill pill-pending">Pendiente</span>';
    if (t.status === 'fail')    pill = '<span class="status-pill pill-fail">Fallida</span>';

    list.insertAdjacentHTML('beforeend', `
      <div class="tx">
        <div class="tx-icon">
          ${t.icon === 'in'
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a93a6" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>'}
        </div>
        <div class="tx-info">
          <div class="who">${t.who}</div>
          <div class="meta">${t.date} ${pill}</div>
        </div>
        <div class="tx-amount ${cls}">${sign}S/ ${amt}</div>
      </div>
    `);
  });
}

/* ============================================================
   7. TRANSFERENCIAS
   ============================================================ */

function goToConfirm(){
  const amount  = document.getElementById('amount').value.trim();
  const dest    = document.getElementById('destAccount').value.trim();
  const bankSel = document.getElementById('destBank');
  const bank    = bankSel.options[bankSel.selectedIndex].text;
  const desc    = document.getElementById('desc').value.trim();

  // [BUG #VAL-4] parseFloat acepta "100abc" como 100.
  // Tampoco rechaza negativos ni cero.
  const monto = parseFloat(amount);

  if (!amount || isNaN(monto)) {
    // [BUG #UX-7] Mensaje genérico "Error" no ayuda al usuario a corregir.
    showToast("Error", true);
    return;
  }

  // [BUG #VAL-5] No valida saldo disponible.
  // [BUG #VAL-6] No valida la cuenta destino: vacío, letras, longitud.
  // [BUG #VAL-7] No valida que destino != cuenta origen.

  pendingTransfer = { monto, dest, bank, desc };

  // [BUG #SEC-6] Cuenta destino mostrada COMPLETA sin enmascarar.
  document.getElementById('cMonto').textContent  = 'S/ ' + monto.toFixed(2);
  document.getElementById('cCuenta').textContent = dest || '(sin cuenta)';
  document.getElementById('cBanco').textContent  = bank;

  // [BUG #SEC-7] Descripción se inyecta con innerHTML sin sanitizar → XSS.
  // Probar con: <img src=x onerror=alert(1)>
  document.getElementById('cDesc').innerHTML = desc || '—';

  goTo('screen-confirm');
}

function executeTransfer(){
  // [BUG #EST-1] Sin protección contra doble click. La variable existe pero
  // el bloque que la usa está comentado.
  // if (isProcessing) return;
  // isProcessing = true;

  const overlay     = document.getElementById('overlay');
  const overlayText = document.getElementById('overlayText');
  overlayText.textContent = "Procesando operación...";
  overlay.classList.add('show');

  const random = Math.random();

  setTimeout(() => {
    // [BUG #EST-2] ~25%: spinner infinito sin timeout.
    // [BUG #EST-3] Aun así descuenta saldo y registra como pendiente.
    if (random < 0.25) {
      overlayText.textContent = "Procesando operación...";
      saldo = saldo - pendingTransfer.monto;
      txHistory.unshift({
        who: "Transferencia a " + (pendingTransfer.dest || 'cuenta'),
        amount: -pendingTransfer.monto,
        status: "pending",
        date: "Ahora",
        icon: "out"
      });
      persist();
      return;
    }

    overlay.classList.remove('show');

    // [BUG #LOG-2] ~15%: la operación falla pero igual descuenta el saldo.
    if (random < 0.40) {
      saldo = saldo - pendingTransfer.monto;
      txHistory.unshift({
        who: "Transferencia a " + (pendingTransfer.dest || 'cuenta'),
        amount: -pendingTransfer.monto,
        status: "fail",
        date: "Ahora",
        icon: "out"
      });
      persist();
      showResult('fail',
        'No se pudo completar',
        'Error',
        'REF: ' + Math.floor(Math.random() * 9999999)
      );
      return;
    }

    saldo = saldo - pendingTransfer.monto;

    // [BUG #LOG-3] El estado final depende de la paridad del monto en céntimos.
    const realStatus = (Math.floor(pendingTransfer.monto * 100) % 2 === 0) ? "ok" : "pending";
    txHistory.unshift({
      who: "Transferencia a " + (pendingTransfer.dest || 'cuenta'),
      amount: -pendingTransfer.monto,
      status: realStatus,
      date: "Ahora",
      icon: "out"
    });
    persist();

    showResult('ok',
      '¡Transferencia exitosa!',
      'Tu operación se procesó correctamente y el dinero está en camino.',
      'REF: ' + Math.floor(Math.random() * 9999999)
    );
  }, 1600);
}

function showResult(type, title, msg, ref){
  const box  = document.getElementById('resultBox');
  const icon = document.getElementById('resultIcon');
  box.className = 'result ' + type;

  if (type === 'ok') {
    icon.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'pending') {
    icon.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  } else {
    icon.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }

  document.getElementById('resultTitle').textContent = title;
  document.getElementById('resultMsg').textContent   = msg;
  document.getElementById('resultRef').textContent   = ref;

  goTo('screen-result');
}

/* ============================================================
   8. TARJETAS
   ============================================================ */

function renderCards(){
  const list = document.getElementById('ccList');
  if (!list) return;
  list.innerHTML = '';
  cards.forEach(c => {
    // [BUG #SEC-8] Se renderiza el número de tarjeta COMPLETO sin enmascarar.
    // Lo correcto sería mostrar **** **** **** 9012.
    list.insertAdjacentHTML('beforeend', `
      <div class="cc ${c.brand}">
        <div class="brand-row">
          <span>${c.brand.toUpperCase()}</span>
          <span>PerúPay</span>
        </div>
        <div class="num">${c.num}</div>
        <div class="meta">
          <div>Titular<strong>${c.name}</strong></div>
          <div>Vence<strong>${c.exp}</strong></div>
        </div>
      </div>
    `);
  });
}

function addCard(){
  const num  = document.getElementById('ccNum').value.trim();
  const name = document.getElementById('ccName').value.trim();
  const exp  = document.getElementById('ccExp').value.trim();
  const cvv  = document.getElementById('ccCvv').value.trim();

  // [BUG #VAL-8] No valida algoritmo de Luhn.
  if (!num || !name || !exp || !cvv) {
    showToast("Completa todos los campos", true);
    return;
  }

  // [BUG #VAL-9] Acepta cualquier formato de fecha. Mes 13, 00, 99 pasan.
  // Tampoco valida que la tarjeta no esté vencida.

  // [BUG #SEC-9] CVV escrito al console.log "para debug".
  console.log("Nueva tarjeta:", { num, cvv });

  // [BUG #LOG-4] Permite agregar la MISMA tarjeta dos veces (sin dedupe).
  let brand = "visa";
  if (num.startsWith("5")) brand = "master";
  if (num.startsWith("3")) brand = "amex";

  cards.push({
    id: cards.length + 1,
    brand,
    num,                              // [BUG #SEC-8 cont.] guardado completo
    name,
    exp
  });
  persist();

  showToast("Tarjeta agregada");
  goTo('screen-cards');
}

/* ============================================================
   9. MOVIMIENTOS (con filtros)
   ============================================================ */

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('chip')) {
    document.querySelectorAll('#movFilters .chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    currentMovFilter = e.target.dataset.filter;
    renderMovements();
  }
});

function renderMovements(){
  const list  = document.getElementById('movList');
  const empty = document.getElementById('movEmpty');
  if (!list) return;
  list.innerHTML = '';

  let data = txHistory.slice();

  // [BUG #LOG-5] El ordenamiento por fecha es alfabético sobre el string,
  // no cronológico.
  data.sort((a, b) => a.date < b.date ? 1 : -1);

  if (currentMovFilter === 'in') {
    // [BUG #LOG-6] Filtro "Ingresos" usa solo el signo, así que también
    // muestra los pendientes que en realidad son egresos parciales.
    data = data.filter(t => t.amount > 0 || t.status === 'pending');
  } else if (currentMovFilter === 'out') {
    data = data.filter(t => t.amount < 0);
  } else if (currentMovFilter === 'pending') {
    data = data.filter(t => t.status === 'pending');
  } else if (currentMovFilter === 'week') {
    // [BUG #LOG-7] Filtro "Esta semana" en realidad no filtra: devuelve todo.
    data = data;
  } else if (currentMovFilter === 'month') {
    // [BUG #LOG-8] Filtro "Este mes" sólo busca el string "abr" o "Hoy"/"Ayer".
    data = data.filter(t => t.date.indexOf('abr') !== -1 || t.date.indexOf('Hoy') !== -1 || t.date.indexOf('Ayer') !== -1);
  }

  // [BUG #UX-8] El empty-state está SIEMPRE oculto, aunque la lista esté
  // vacía (la condición está negada).
  if (empty) empty.style.display = data.length === 0 ? 'none' : 'none';

  data.forEach(t => {
    const sign = t.amount >= 0 ? '+' : '-';
    const amt  = Math.abs(t.amount).toFixed(2);
    const cls  = t.amount >= 0 ? 'in' : 'out';
    let pill = '';
    if (t.status === 'ok')      pill = '<span class="status-pill pill-ok">Completada</span>';
    if (t.status === 'pending') pill = '<span class="status-pill pill-pending">Pendiente</span>';
    if (t.status === 'fail')    pill = '<span class="status-pill pill-fail">Fallida</span>';

    list.insertAdjacentHTML('beforeend', `
      <div class="tx">
        <div class="tx-icon">
          ${t.icon === 'in'
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a93a6" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>'}
        </div>
        <div class="tx-info">
          <div class="who">${t.who}</div>
          <div class="meta">${t.date} ${pill}</div>
        </div>
        <div class="tx-amount ${cls}">${sign}S/ ${amt}</div>
      </div>
    `);
  });
}

/* ============================================================
   10. RECARGA
   ============================================================ */

function doRecharge(){
  const op     = document.getElementById('rechargeOp').value;
  const phone  = document.getElementById('rechargePhone').value.trim();
  const amount = document.getElementById('rechargeAmount').value.trim();
  const monto  = parseFloat(amount);

  // [BUG #VAL-10] Acepta cualquier longitud de teléfono.
  if (!phone) {
    showToast("Falta el número", true);
    return;
  }

  // [BUG #VAL-11] El teléfono acepta letras.
  // [BUG #VAL-12] Acepta montos negativos o cero.
  if (isNaN(monto)) {
    showToast("Monto inválido", true);
    return;
  }

  // [BUG #LOG-9] El subtítulo dice "5% de bonificación" pero
  // multiplica por 0.005 → en realidad bonifica 0.5%.
  const bonus = monto * 0.005;

  // [BUG #EST-4] Race condition: doble click duplica recarga (sin guard).
  saldo = saldo - monto + bonus;

  txHistory.unshift({
    who:    "Recarga " + op,
    amount: -monto,
    status: "ok",
    // [BUG #UX-9] Formato de fecha distinto al resto: "2026-04-30 12:33:01" vs "Hoy, 08:12".
    date:   new Date().toISOString().replace('T', ' ').slice(0, 19),
    icon:   "out"
  });
  persist();

  showToast("Recarga realizada por S/ " + monto.toFixed(2));
  goTo('screen-home');
}

/* ============================================================
   11. PAGAR SERVICIOS
   ============================================================ */

function selectService(name, type){
  selectedService = { name, type };
  showToast("Servicio: " + name);
}

function payService(){
  const code   = document.getElementById('svcCode').value.trim();
  const amount = document.getElementById('svcAmount').value.trim();
  const monto  = parseFloat(amount);

  if (!selectedService) {
    showToast("Selecciona un servicio", true);
    return;
  }

  // [BUG #VAL-13] El código del servicio acepta cualquier longitud
  // (incluso vacío - condición mal formulada).
  if (code.length < 0) {
    showToast("Código requerido", true);
    return;
  }

  if (isNaN(monto) || monto <= 0) {
    showToast("Monto inválido", true);
    return;
  }

  // [BUG #LOG-10] Se anuncia que la comisión es S/ 1.50 pero
  // sólo se descuenta el monto. La comisión nunca se aplica.
  const comision = 1.50;
  saldo = saldo - monto;   // ← debería ser - (monto + comision)

  // [BUG #SEC-10] El URL "compartir comprobante" expone datos en query string.
  const shareUrl = window.location.origin + "?svc=" + selectedService.name + "&code=" + code;
  console.log("Compartir:", shareUrl);

  txHistory.unshift({
    who:    selectedService.name + " (" + selectedService.type + ")",
    amount: -monto,
    status: "ok",
    date:   "Ahora",
    icon:   "out"
  });
  persist();

  showToast("Pago realizado · Comisión: S/ " + comision.toFixed(2));
  goTo('screen-home');
}

/* ============================================================
   12. PERFIL
   ============================================================ */

function renderProfileForm(){
  document.getElementById('inpName').value  = profile.name  || '';
  document.getElementById('inpEmail').value = profile.email || '';
  document.getElementById('inpPhone').value = profile.phone || '';
  document.getElementById('pName').textContent = profile.name || '';
  document.getElementById('pSub').textContent  = `Cuenta personal · DNI ••••${(profile.dni || '').slice(-4)}`;
}

function saveProfile(){
  const name  = document.getElementById('inpName').value.trim();
  const email = document.getElementById('inpEmail').value.trim();
  const phone = document.getElementById('inpPhone').value.trim();

  // [BUG #VAL-14] Email regex demasiado permisiva: pasa "abc@".
  if (!/^.+@.+$/.test(email)) {
    showToast("Email inválido", true);
    return;
  }

  // [BUG #VAL-15] Teléfono no se valida: acepta letras o cualquier longitud.
  if (!phone) {
    showToast("Teléfono requerido", true);
    return;
  }

  profile.name  = name;
  profile.email = email;
  profile.phone = phone;
  persist();

  // [BUG #SEC-11] El nombre se inyecta con innerHTML → XSS persistente
  // (ahora también queda guardado en localStorage).
  document.getElementById('pName').innerHTML = name;

  // [BUG #DAT-3] Cambiar el nombre actualiza pName pero NO refresca:
  //   - el saludo del home (#helloUser)
  //   - el chip de usuario en el topbar (.user-chip .uname)
  //   - el avatar (las iniciales DR)
  // Sólo se sincroniza al recargar la página.

  // [BUG #UX-10] Falta feedback de éxito explícito.
  // showToast("Cambios guardados");
}

/* ============================================================
   13. CASHBACK / PROMO
   ============================================================ */

function claimCashback(){
  // [BUG #LOG-11] El banner dice "Cashback de 5%" pero el cálculo
  // multiplica por 0.005 (= 0.5%).
  const ultimaTransferencia = txHistory.find(t => t.who.startsWith("Transferencia"));
  if (!ultimaTransferencia) {
    showToast("Aún no tienes transferencias para activar la promo", true);
    return;
  }
  const cashback = Math.abs(ultimaTransferencia.amount) * 0.005;
  saldo += cashback;
  persist();
  showToast("Cashback aplicado: S/ " + cashback.toFixed(2));
}

/* ============================================================
   14. HELP / FAQ SEARCH
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const faqSearchEl = document.getElementById('faqSearch');
  if (faqSearchEl) {
    faqSearchEl.addEventListener('input', (e) => {
      // [BUG #LOG-12] El buscador escucha el input pero nunca filtra los
      // <details>. Escribir cualquier cosa no hace nada visible.
      const q = e.target.value;
      void q;
    });
  }
});

/* ============================================================
   15. RENDER GLOBAL
   ============================================================
   [BUG #A11Y-2] Sin aria-labels, sin aria-disabled, sin role en
   elementos interactivos no nativos (.action, .nav-item, .svc).
   ============================================================ */

function renderAll(){
  renderHomeChrome();
  renderTx();
  renderCards();
  renderMovements();
  renderProfileForm();
}

renderAll();
persist();
