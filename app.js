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

/* ---------- ESTADO GLOBAL ---------- */
let saldo = 2450.75;

let txHistory = [
  { who:"Recarga Yape",      amount:+150,     status:"ok",      date:"Hoy, 08:12",     icon:"in"  },
  { who:"María Fernández",   amount:-85.50,   status:"ok",      date:"Ayer, 19:33",    icon:"out" },
  { who:"Netflix Perú",      amount:-44.90,   status:"ok",      date:"Ayer, 12:01",    icon:"out" },
  { who:"Carlos Ríos",       amount:-200.00,  status:"pending", date:"22 abr, 16:48",  icon:"out" },
  { who:"Sueldo abril",      amount:+3200.00, status:"ok",      date:"01 abr, 09:00",  icon:"in"  },
  { who:"Sedapal",           amount:-58.20,   status:"ok",      date:"15 abr, 10:22",  icon:"out" },
  { who:"Luz del Sur",       amount:-112.40,  status:"ok",      date:"12 abr, 11:08",  icon:"out" },
  { who:"Pedro Quispe",      amount:-30.00,   status:"fail",    date:"08 abr, 21:55",  icon:"out" }
];

let cards = [
  { id:1, brand:"visa",   num:"4532 1234 5678 9012", name:"Diego Ramírez", exp:"08/27" },
  { id:2, brand:"master", num:"5555 4444 3333 2222", name:"Diego Ramírez", exp:"03/29" }
];

let pendingTransfer = null;
let isProcessing = false;          // declarada pero NO usada (ver [BUG #EST-1])
let currentMovFilter = "all";
let loginTabType = "dni";

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

  // [BUG #SEC-2] Backdoor de demostración olvidado: si user === "admin"
  // se ignora completamente la contraseña.
  if (user === "admin") {
    showToast("Bienvenido, administrador");
    enterApp();
    return;
  }

  // [BUG #VAL-1] La contraseña mínima son 4 caracteres (debería ser >=8).
  if (!user || pass.length < 4) {
    // [BUG #UX-2] El mensaje de error no distingue si falla user o password.
    showToast("Credenciales inválidas", true);
    return;
  }

  // [BUG #VAL-2] El DNI peruano tiene 8 dígitos. Esta regex acepta de 5 a 12.
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
  // junto con el usuario. Cualquier script en la pestaña lo lee.
  localStorage.setItem('pp_user', user);
  localStorage.setItem('pp_pass', pass);

  enterApp();
}

function enterApp(){
  goTo('screen-home');
  renderTx();
  renderCards();
}

function logout(){
  // [BUG #SEC-4] No limpia localStorage al cerrar sesión, así que
  // el password queda almacenado.
  goTo('screen-login');
  showToast("Sesión cerrada");
}

// [BUG #SEC-5] Auto-login eterno: si quedó algo en localStorage,
// la sesión nunca expira (no hay token con TTL).
(function autoLogin(){
  if (localStorage.getItem('pp_user')) {
    setTimeout(enterApp, 50);
  }
})();

/* ============================================================
   2. NAVEGACIÓN
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
    // [BUG #DAT-2] Al volver al home NO se actualiza el saldo:
    // queda fijo el valor inicial en el DOM aunque `saldo` haya cambiado.
    // Falta intencional:
    // document.getElementById('saldoView').textContent = saldo.toFixed(2);
  }
  if (id === 'screen-transfer') {
    document.getElementById('amount').value = '';
    document.getElementById('destAccount').value = '';
    document.getElementById('desc').value = '';
  }
  if (id === 'screen-cards')     renderCards();
  if (id === 'screen-movements') renderMovements();
}

/* ============================================================
   3. TOAST
   ============================================================ */

function showToast(msg, isError=false){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  // [BUG #UX-4] Toast desaparece a los 2.8s incluso para errores críticos
  // (el usuario no alcanza a leerlos en operaciones financieras).
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ============================================================
   4. HOME · LISTA DE TRANSACCIONES
   ============================================================ */

function renderTx(){
  const list = document.getElementById('txList');
  if (!list) return;
  list.innerHTML = '';
  txHistory.slice(0, 5).forEach(t => {
    const sign = t.amount >= 0 ? '+' : '-';
    // [BUG #UX-5] Formato de monto inconsistente: aquí no hay separador
    // de miles, pero en el balance card sí (2,450.75).
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
   5. TRANSFERENCIAS
   ============================================================ */

function goToConfirm(){
  const amount  = document.getElementById('amount').value.trim();
  const dest    = document.getElementById('destAccount').value.trim();
  const bankSel = document.getElementById('destBank');
  const bank    = bankSel.options[bankSel.selectedIndex].text;
  const desc    = document.getElementById('desc').value.trim();

  // [BUG #VAL-4] parseFloat acepta "100abc" como 100.
  // Tampoco rechaza negativos ni cero ni números absurdos como 99999999.
  const monto = parseFloat(amount);

  if (!amount || isNaN(monto)) {
    // [BUG #UX-7] Mensaje genérico "Error" no ayuda al usuario a corregir.
    showToast("Error", true);
    return;
  }

  // [BUG #VAL-5] No valida saldo disponible. Permite transferir más de lo que se tiene.
  // [BUG #VAL-6] No valida la cuenta destino: vacío, letras, longitud distinta a CCI.
  // [BUG #VAL-7] No valida que destino != cuenta origen (4471).

  pendingTransfer = { monto, dest, bank, desc };

  // [BUG #SEC-6] Cuenta destino mostrada COMPLETA sin enmascarar (debería ser •••• 9012).
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
  // el bloque que la usa está comentado: el usuario puede confirmar 3 veces
  // y descontar saldo 3 veces.
  // if (isProcessing) return;
  // isProcessing = true;

  const overlay     = document.getElementById('overlay');
  const overlayText = document.getElementById('overlayText');
  overlayText.textContent = "Procesando operación...";
  overlay.classList.add('show');

  const random = Math.random();

  setTimeout(() => {
    // [BUG #EST-2] ~25%: spinner infinito sin timeout (caso del enunciado original).
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
      showResult('fail',
        'No se pudo completar',
        'Error',                           // [BUG #UX-7 ref] mensaje genérico
        'REF: ' + Math.floor(Math.random() * 9999999)
      );
      return;
    }

    saldo = saldo - pendingTransfer.monto;

    // [BUG #LOG-3] El estado final depende de si el monto en céntimos es par o impar.
    const realStatus = (Math.floor(pendingTransfer.monto * 100) % 2 === 0) ? "ok" : "pending";
    txHistory.unshift({
      who: "Transferencia a " + (pendingTransfer.dest || 'cuenta'),
      amount: -pendingTransfer.monto,
      status: realStatus,
      date: "Ahora",
      icon: "out"
    });

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
   6. TARJETAS
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

  // [BUG #VAL-8] No valida algoritmo de Luhn: cualquier secuencia de 16
  // dígitos (o incluso menos) se acepta.
  if (!num || !name || !exp || !cvv) {
    showToast("Completa todos los campos", true);
    return;
  }

  // [BUG #VAL-9] Acepta cualquier formato de fecha. Mes 13, 00, 99 pasan.
  // Tampoco valida que la tarjeta no esté vencida.
  // Lo correcto: regex MM/AA con 01<=MM<=12 y fecha >= mes actual.

  // [BUG #SEC-9] CVV escrito al console.log "para debug".
  // Datos sensibles NUNCA deberían salir por consola.
  console.log("Nueva tarjeta:", { num, cvv });

  // [BUG #LOG-4] Permite agregar la MISMA tarjeta dos veces (no valida duplicados).
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

  showToast("Tarjeta agregada");
  goTo('screen-cards');
}

/* ============================================================
   7. MOVIMIENTOS (con filtros)
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
  // no cronológico. "01 abr" termina antes que "Hoy" pero "22 abr" antes
  // que "Ayer" — el orden visible se rompe.
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
    // [BUG #LOG-8] Filtro "Este mes" sólo busca strings con "abr",
    // así que en mayo no mostrará nada y en abril mostrará todo.
    data = data.filter(t => t.date.indexOf('abr') !== -1 || t.date.indexOf('Hoy') !== -1 || t.date.indexOf('Ayer') !== -1);
  }

  // [BUG #UX-8] El empty-state aparece SIEMPRE oculto, aunque la lista esté
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
   8. RECARGA
   ============================================================ */

function doRecharge(){
  const op     = document.getElementById('rechargeOp').value;
  const phone  = document.getElementById('rechargePhone').value.trim();
  const amount = document.getElementById('rechargeAmount').value.trim();
  const monto  = parseFloat(amount);

  // [BUG #VAL-10] Acepta cualquier longitud de teléfono. En Perú son 9 dígitos.
  if (!phone) {
    showToast("Falta el número", true);
    return;
  }

  // [BUG #VAL-11] El teléfono acepta letras (no se valida que sea numérico).
  // [BUG #VAL-12] Acepta montos negativos o cero. parseFloat("-50") pasa.
  if (isNaN(monto)) {
    showToast("Monto inválido", true);
    return;
  }

  // [BUG #LOG-9] El subtítulo dice "5% de bonificación" pero el cálculo
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

  showToast("Recarga realizada por S/ " + monto.toFixed(2));
  goTo('screen-home');
}

/* ============================================================
   9. PAGAR SERVICIOS
   ============================================================ */

let selectedService = null;

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
  // (incluso vacío en la siguiente línea — la condición está mal).
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

  // [BUG #SEC-10] Al "compartir comprobante" se construye un URL que
  // expone el código del servicio en query string (información sensible
  // que va al historial del navegador y a logs de servidor).
  const shareUrl = window.location.origin + "?svc=" + selectedService.name + "&code=" + code;
  console.log("Compartir:", shareUrl);

  txHistory.unshift({
    who:    selectedService.name + " (" + selectedService.type + ")",
    amount: -monto,
    status: "ok",
    date:   "Ahora",
    icon:   "out"
  });

  showToast("Pago realizado · Comisión: S/ " + comision.toFixed(2));
  goTo('screen-home');
}

/* ============================================================
   10. PERFIL
   ============================================================ */

function saveProfile(){
  const name  = document.getElementById('inpName').value.trim();
  const email = document.getElementById('inpEmail').value.trim();
  const phone = document.getElementById('inpPhone').value.trim();

  // [BUG #VAL-14] Valida email con regex tan permisiva que pasa "abc@".
  if (!/^.+@.+$/.test(email)) {
    showToast("Email inválido", true);
    return;
  }

  // [BUG #VAL-15] Teléfono no se valida: acepta letras o cualquier longitud.
  if (!phone) {
    showToast("Teléfono requerido", true);
    return;
  }

  // [BUG #SEC-11] El nombre se inyecta con innerHTML → XSS.
  // Probar con: <img src=x onerror=alert(document.cookie)>
  document.getElementById('pName').innerHTML = name;

  // [BUG #DAT-3] Cambiar el nombre actualiza pName pero NO actualiza:
  //   - el saludo del home (#helloUser)
  //   - el chip de usuario en el topbar (.user-chip .uname)
  //   - el avatar (las iniciales DR)
  // Los datos quedan desincronizados entre pantallas.

  // [BUG #UX-10] El botón "Guardar" no muestra feedback de éxito explícito;
  // el usuario no sabe si se guardó.
  // showToast("Cambios guardados");   ← falta intencional
}

/* ============================================================
   11. CASHBACK / PROMO
   ============================================================ */

function claimCashback(){
  // [BUG #LOG-11] El banner dice "Cashback de 5%" pero el cálculo
  // multiplica el monto por 0.005 (= 0.5%).
  const ultimaTransferencia = txHistory.find(t => t.who.startsWith("Transferencia"));
  if (!ultimaTransferencia) {
    showToast("Aún no tienes transferencias para activar la promo", true);
    return;
  }
  const cashback = Math.abs(ultimaTransferencia.amount) * 0.005;
  saldo += cashback;
  showToast("Cashback aplicado: S/ " + cashback.toFixed(2));
}

/* ============================================================
   12. HELP / FAQ SEARCH
   ============================================================ */

const faqSearchEl = document.getElementById('faqSearch');
if (faqSearchEl) {
  faqSearchEl.addEventListener('input', (e) => {
    // [BUG #LOG-12] El buscador escucha el input pero nunca filtra los
    // <details>. Escribir cualquier cosa no hace nada visible.
    const q = e.target.value;
    void q;
  });
}

/* ============================================================
   INIT
   ============================================================
   [BUG #A11Y-2] Sin aria-labels, sin aria-disabled, sin role en
   elementos interactivos no nativos (.action, .nav-item, .svc).
   ============================================================ */

renderTx();
renderCards();
