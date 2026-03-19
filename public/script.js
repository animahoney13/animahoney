/* ============================================================
   FIREBASE — safe initialisation
   ============================================================ */
let auth = null;
let db   = null;

try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
    const {
        getAuth,
        createUserWithEmailAndPassword,
        signInWithEmailAndPassword,
        onAuthStateChanged,
        signOut
    } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    const {
        getFirestore,
        doc,
        setDoc,
        getDoc,
        collection,
        addDoc,
        serverTimestamp
    } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

    const firebaseConfig = {
        apiKey: "AIzaSyAIL1j4r5Z_2f1lOPDj9HCyeWFp9Yr8xxo",
            authDomain: "animahoney-c68bd.firebaseapp.com",
            projectId: "animahoney-c68bd",
            storageBucket: "animahoney-c68bd.firebasestorage.app",
            messagingSenderId: "494327207870",
            appId: "1:494327207870:web:24f915185a3180213e4bef"
    };

    // Validate that config is not empty before attempting init
    const configValid = firebaseConfig.apiKey && firebaseConfig.projectId;
    if (!configValid) throw new Error("Firebase config is empty — running without auth.");

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);

    /* ── Auth state listener (only runs when Firebase is live) ── */
    onAuthStateChanged(auth, async (user) => {
        updateAuthButtonUI(user);
        if (user && db) {
            try {
                const snap = await getDoc(doc(db, "carts", user.uid));
                if (snap.exists()) window.cart = snap.data().items || [];
            } catch (_) { /* cart sync failed silently */ }
        }
        renderProducts();
        updateCart();
    });

    /* ── Expose Firebase-dependent helpers ── */

    window.handleAuthAction = async () => {
        const email   = document.getElementById('authEmail').value.trim();
        const pass    = document.getElementById('authPass').value;
        const isLogin = document.getElementById('authSubmit').innerText === "Login";
        if (!email || !pass) { showToast("Please fill in all fields.", "error"); return; }
        try {
            if (isLogin) await signInWithEmailAndPassword(auth, email, pass);
            else         await createUserWithEmailAndPassword(auth, email, pass);
            toggleAuthModal(false);
        } catch (err) { showToast(err.message, "error"); }
    };

    window.logout = () => signOut(auth);

    window.subscribeNewsletter = async () => {
        const emailInput = document.getElementById('newsletterEmail');
        const btn        = document.getElementById('newsletterBtn');
        const rawEmail   = emailInput.value.trim().toLowerCase();

        // Must be logged in to subscribe
        if (!auth.currentUser) {
            showToast("Please login first to join the newsletter.", "info");
            toggleAuthModal(true);
            return;
        }

        // Basic format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(rawEmail)) {
            showToast("Please enter a valid email address.", "error");
            return;
        }

        btn.disabled = true;
        btn.innerText = '...';

        try {
            // Use the email itself as the document ID.
            // Firestore document IDs cannot contain '/' so we replace it — but
            // a valid email never contains '/' anyway, so the email is safe as-is.
            // We encode '@' and '.' to keep the ID clean and unambiguous.
            const docId   = rawEmail.replace(/@/g, '_at_').replace(/\./g, '_dot_');
            const docRef  = doc(db, "newsletter_subscribers", docId);
            const existing = await getDoc(docRef);

            if (existing.exists()) {
                showToast("You're already subscribed! 🍯", "info");
                emailInput.value = "";
                return;
            }

            // New subscriber — write with setDoc so the email-based ID is permanent
            await setDoc(docRef, {
                email:     rawEmail,
                timestamp: serverTimestamp()
            });

            showToast("Welcome to the Hive! 🍯", "success");
            emailInput.value = "";

        } catch (err) {
            showToast("Error subscribing. Please try again.", "error");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Join';
        }
    };

    /* Cart sync to Firestore */
    window._syncCartToFirestore = async () => {
        if (auth?.currentUser && db) {
            try { await setDoc(doc(db, "carts", auth.currentUser.uid), { items: window.cart }); }
            catch (_) { /* silently ignore sync failures */ }
        }
    };

} catch (firebaseError) {
    // Firebase unavailable — gracefully degrade
    console.warn("Firebase unavailable:", firebaseError.message);

    // Disable the sign-in button and show a hint
    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) {
        signupBtn.disabled = true;
        signupBtn.title    = "Login unavailable right now";
        signupBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    // Stub out Firebase-dependent functions so they don't throw
    window.handleAuthAction     = () => showToast("Login unavailable right now.", "info");
    window.logout               = () => showToast("Login unavailable right now.", "info");
    window.subscribeNewsletter  = () => showToast("Newsletter unavailable right now.", "info");
    window._syncCartToFirestore = () => {};

    // Still boot the rest of the site
    renderProducts();
    updateCart();
}

/* ============================================================
   PRODUCT CATALOGUE
   ============================================================ */
const products = [
    {
        id: 1,
        name: "Litchi Honey",
        img: "./public/img8.png",
        variants: [
            { weight: "500g", price: 399.00 },
            { weight: "1kg",  price: 649.00 }
        ]
    },
    {
        id: 2,
        name: "Mustard Honey",
        img: "./public/img10.jpeg",
        variants: [
            { weight: "500g", price: 299.00 },
            { weight: "1kg",  price: 499.00 }
        ]
    }
];

/* ============================================================
   CART STATE
   ============================================================ */
window.cart = JSON.parse(localStorage.getItem('honey_cart')) || [];

/* ============================================================
   GALLERY STATE
   ============================================================ */
window.currentGalleryIdx = 0;

/* ============================================================
   BLOG STATE
   ============================================================ */
let blogIdx = 0;
const BLOG_VISIBLE = () => window.innerWidth > 768 ? 3 : 1;

/* ============================================================
   UTILITY
   ============================================================ */
window.smoothScrollTo = (selector) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
};

/* ============================================================
   AUTH UI
   ============================================================ */
function updateAuthButtonUI(user) {
    const btn      = document.getElementById('signupBtn');
    const isMobile = window.innerWidth <= 768;
    if (!btn) return;

    if (user) {
        btn.innerHTML = isMobile
            ? '<span class="text-xl">⏻</span>'
            : `Logout (${user.email.split('@')[0]})`;
        btn.onclick = window.logout;
        btn.title   = `Logout ${user.email}`;
        btn.disabled = false;
        btn.classList.remove('opacity-60', 'cursor-not-allowed');
    } else {
        btn.innerHTML = isMobile
            ? '<span class="text-xl">👤</span>'
            : "Sign Up / Login";
        btn.onclick = () => toggleAuthModal(true);
        btn.title   = "Sign Up / Login";
    }
}

window.updateAuthButtonUI = updateAuthButtonUI;

window.toggleAuthModal = (show) => {
    // If Firebase is not available, show toast instead of the modal
    if (show && !auth) {
        showToast("Login unavailable right now.", "info");
        return;
    }
    document.getElementById('authModal').classList.toggle('hidden', !show);
};

function toggleAuthModal(show) { window.toggleAuthModal(show); }

window.toggleAuthType = () => {
    const isLogin = document.getElementById('authSubmit').innerText === "Login";
    document.getElementById('authTitle').innerText     = isLogin ? "Join the Hive" : "Login to Anima Honey";
    document.getElementById('authSubmit').innerText    = isLogin ? "Sign Up" : "Login";
    document.getElementById('authToggleBtn').innerText = isLogin ? "Login" : "Sign Up";
};

/* ── Password eye toggle ── */
window.togglePasswordVisibility = () => {
    const input   = document.getElementById('authPass');
    const iconShow = document.getElementById('eyeIconShow');
    const iconHide = document.getElementById('eyeIconHide');
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    iconShow.classList.toggle('hidden', isPassword);
    iconHide.classList.toggle('hidden', !isPassword);
};

window.addEventListener('resize', () => updateAuthButtonUI(auth?.currentUser ?? null));

/* ============================================================
   PRODUCTS
   ============================================================ */
function renderProducts() {
    const grid = document.getElementById("product-grid");
    if (!grid) return;
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-8 justify-center max-w-3xl mx-auto';
    grid.innerHTML = products.map(p => `
        <div class="product-card-wrapper">
            <div class="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl transition-all border border-gray-50 h-full flex flex-col items-center">
                <img src="${p.img}" class="h-44 object-cover rounded-2xl w-full mb-4"
                     alt="${p.name} – pure organic honey available in India" loading="lazy">
                <h3 class="text-lg font-bold text-gray-800">${p.name}</h3>

                <select id="weight-sel-${p.id}" onchange="updatePriceDisplay(${p.id})"
                        class="mt-3 p-2 border rounded-xl text-sm outline-none focus:ring-2 ring-amber-500 bg-amber-50 cursor-pointer"
                        aria-label="Select weight for ${p.name}">
                    ${p.variants.map(v => `<option value="${v.weight}">${v.weight}</option>`).join('')}
                </select>

                <p id="price-display-${p.id}" class="text-amber-600 font-bold mt-2 text-xl">
                    ₹${p.variants[0].price.toFixed(2)}
                </p>

                <div class="flex gap-3 mt-4 w-full">
                    <button onclick="addToCart(${p.id})"
                            class="btn-buy flex-1 py-2 border-2 border-gray-900 rounded-xl font-bold hover:bg-gray-900 hover:text-white transition"
                            aria-label="Add ${p.name} to cart">
                        Pre Order
                    </button>
                    <button onclick="smoothScrollTo('#blog')"
                            class="flex-1 py-2 border-2 border-amber-500 text-amber-600 rounded-xl font-bold hover:bg-amber-500 hover:text-white transition"
                            aria-label="View ${p.name} benefits">
                        Benefits
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

window.renderProducts = renderProducts;

window.updatePriceDisplay = (productId) => {
    const product = products.find(p => p.id === productId);
    const weight  = document.getElementById(`weight-sel-${productId}`).value;
    const variant = product.variants.find(v => v.weight === weight);
    document.getElementById(`price-display-${productId}`).innerText = `₹${variant.price.toFixed(2)}`;
};

/* ============================================================
   CART
   ============================================================ */
window.addToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    const weight  = document.getElementById(`weight-sel-${productId}`).value;
    const variant = product.variants.find(v => v.weight === weight);
    const cartId  = `${productId}-${weight}`;
    const item    = window.cart.find(i => i.cartId === cartId);

    if (item) { item.qty++; }
    else {
        window.cart.push({ cartId, id: productId, name: product.name, weight, price: variant.price, img: product.img, qty: 1 });
    }
    updateCart();
    showToast(`${product.name} (${weight}) added to cart!`, "success");
};

window.changeQty = (cartId, delta) => {
    const item = window.cart.find(i => i.cartId === cartId);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) window.cart = window.cart.filter(i => i.cartId !== cartId);
    }
    updateCart();
};

window.removeOneFromCart = (cartId) => {
    window.cart = window.cart.filter(i => i.cartId !== cartId);
    updateCart();
};

function updateCart() {
    localStorage.setItem('honey_cart', JSON.stringify(window.cart));
    window._syncCartToFirestore?.();

    const badge = document.getElementById('cartCountBadge');
    if (badge) badge.innerText = window.cart.reduce((s, i) => s + i.qty, 0);

    const container   = document.getElementById('cartItemsContainer');
    const checkoutBtn = document.getElementById('mainCheckoutBtn');
    if (!container) return;

    if (window.cart.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 mt-20">Cart is empty 🍯</div>`;
        checkoutBtn?.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        checkoutBtn?.classList.remove('opacity-50', 'cursor-not-allowed');
        container.innerHTML = window.cart.map(item => `
            <div class="flex items-center gap-4 border-b pb-4">
                <img src="${item.img}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" alt="${item.name}" loading="lazy">
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-sm text-gray-800 truncate">${item.name}</h4>
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Weight: ${item.weight}</p>
                    <div class="flex items-center gap-3 mt-2">
                        <button onclick="changeQty('${item.cartId}', -1)" class="w-6 h-6 border rounded hover:bg-gray-100" aria-label="Decrease quantity">-</button>
                        <span class="w-8 h-8 flex items-center justify-center bg-[#D97706] text-white rounded font-bold text-xs shadow-inner">${item.qty}</span>
                        <button onclick="changeQty('${item.cartId}', 1)"  class="w-6 h-6 border rounded hover:bg-gray-100" aria-label="Increase quantity">+</button>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-2 flex-shrink-0">
                    <div class="font-bold text-amber-600">₹${(item.qty * item.price).toFixed(2)}</div>
                    <button onclick="removeOneFromCart('${item.cartId}')" class="text-red-500 p-1 hover:text-red-700" aria-label="Remove ${item.name} from cart">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    const total = window.cart.reduce((s, i) => s + (i.qty * i.price), 0);
    const totalEl = document.getElementById('cartTotalPrice');
    if (totalEl) totalEl.innerText = `₹${total.toFixed(2)}`;
}

window.updateCart = updateCart;

/* ============================================================
   CHECKOUT
   ============================================================ */
window.showCheckoutForm = () => {
    if (window.cart.length === 0) { showToast("Your cart is empty! Add products first.", "error"); return; }
    if (!auth?.currentUser) {
        showToast("Please login to proceed with checkout.", "info");
        toggleCart(false);
        toggleAuthModal(true);
        return;
    }
    document.getElementById('checkoutForm').classList.remove('hidden');
    document.getElementById('mainCheckoutBtn').classList.add('hidden');
};

window.handleCheckout = () => {
    if (window.cart.length === 0) { showToast("Your cart is empty!", "error"); return; }
    const phone = document.getElementById('customerPhone').value.trim();
    if (!phone) { showToast("Please enter your contact number.", "error"); return; }

    let msg = `*New Pre Order from Anima Honey*%0APhone: ${phone}%0AItems:%0A`;
    window.cart.forEach(i => {
        msg += `- ${i.name} (${i.weight}) (x${i.qty}) : ₹${(i.qty * i.price).toFixed(2)}%0A`;
    });
    const total = window.cart.reduce((s, i) => s + (i.qty * i.price), 0);
    msg += `%0ATotal: ₹${total.toFixed(2)}`;

    const waUrl = `https://wa.me/916206186820?text=${msg}`;
    toggleQRModal(true);
    setTimeout(() => {
        const canvas = document.getElementById("qrcode");
        if (canvas && typeof QRCode !== 'undefined') QRCode.toCanvas(canvas, waUrl, { width: 200 });
        const waBtn = document.getElementById('desktopWaBtn');
        if (waBtn) waBtn.onclick = () => window.open(waUrl, '_blank');
    }, 200);
};

/* ============================================================
   CART PANEL TOGGLE
   ============================================================ */
function toggleCart(open) {
    const panel   = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    if (open) {
        panel.classList.add('open');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => overlay.classList.add('opacity-100'));
    } else {
        panel.classList.remove('open');
        overlay.classList.remove('opacity-100');
        document.body.style.overflow = '';
        document.getElementById('checkoutForm')?.classList.add('hidden');
        document.getElementById('mainCheckoutBtn')?.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

window.toggleCart = toggleCart;

/* ============================================================
   MODAL TOGGLES
   ============================================================ */
window.toggleQRModal = (show) => document.getElementById('qrModal')?.classList.toggle('hidden', !show);

window.toggleLegalModal = (show, title = '', content = '') => {
    const m = document.getElementById('legalModal');
    if (!m) return;
    m.classList.toggle('hidden', !show);
    if (show) {
        document.getElementById('legalTitle').innerText    = title;
        document.getElementById('legalContent').innerHTML = content;
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
};

window.toggleFssaiModal = (show) => {
    const m = document.getElementById('fssaiModal');
    if (!m) return;
    m.classList.toggle('hidden', !show);
    document.body.style.overflow = show ? 'hidden' : '';
};

/* ============================================================
   LEGAL CONTENT
   ============================================================ */
window.openPrivacy = () => window.toggleLegalModal(true, 'Privacy Policy', `
    <p>At Anima Honey, we value your privacy and are committed to protecting your personal information.</p>
    <p><strong>1. Information We Collect</strong><br>We only collect the information you voluntarily provide, including: email address (for login or newsletter), phone number (for order communication), and order details.</p>
    <p><strong>2. How We Use Your Information</strong><br>We use your information only to process and confirm your orders, communicate with you via WhatsApp or email, and provide customer support.</p>
    <p><strong>3. No Tracking or Analytics</strong><br>We do not use any analytics tools, tracking software, or third-party advertising services.</p>
    <p><strong>4. Data Storage</strong><br>Your data is securely stored using Firebase services. We do not sell, rent, or share your personal information with third parties.</p>
    <p><strong>5. Your Rights</strong><br>You can request deletion of your data at any time by contacting us at animahoney13@gmail.com</p>
`);

window.openTerms = () => window.toggleLegalModal(true, 'Terms & Conditions', `
    <p>By using Anima Honey, you agree to the following terms:</p>
    <p><strong>1. Products</strong><br>All honey products are natural and may vary slightly in taste, color, and texture.</p>
    <p><strong>2. Orders</strong><br>Orders are confirmed only after successful communication via WhatsApp or other provided channels.</p>
    <p><strong>3. Pricing</strong><br>All prices are listed in INR (₹) and are subject to change without prior notice.</p>
    <p><strong>4. User Responsibility</strong><br>You agree to provide accurate contact information when placing an order.</p>
    <p><strong>5. Limitation of Liability</strong><br>Anima Honey is not liable for delays, damages, or losses caused by third-party delivery services.</p>
    <p><strong>6. Changes to Terms</strong><br>We reserve the right to update these terms at any time without notice.</p>
`);

window.openRefund = () => window.toggleLegalModal(true, 'Shipping & Returns', `
    <p><strong>1. Shipping</strong><br>Orders are processed within 1–3 business days. Delivery typically takes 3–7 business days depending on location.</p>
    <p><strong>2. Shipping Charges</strong><br>Shipping charges may apply and will be communicated during order confirmation.</p>
    <p><strong>3. Returns</strong><br>Due to the nature of food products, we do not accept returns once the product is delivered.</p>
    <p><strong>4. Damaged or Incorrect Orders</strong><br>If you receive a damaged or incorrect product, please contact us within 24 hours with proof (images).</p>
    <p><strong>5. Refunds</strong><br>Refunds or replacements will be processed only after verification of the issue.</p>
`);

/* ============================================================
   GALLERY SLIDER
   ============================================================ */
window.slideGallery = (dir) => {
    const items        = document.querySelectorAll('.gallery-item-wrapper');
    const visibleCount = window.innerWidth > 768 ? 3 : 1;
    const maxIdx       = items.length - visibleCount;
    if (dir === 'next' && window.currentGalleryIdx < maxIdx) window.currentGalleryIdx++;
    else if (dir === 'prev' && window.currentGalleryIdx > 0) window.currentGalleryIdx--;
    const itemWidth = items[0]?.offsetWidth ?? 0;
    const gap       = 32;
    document.getElementById("gallery-grid").style.transform =
        `translateX(-${window.currentGalleryIdx * (itemWidth + gap)}px)`;
};

/* ============================================================
   BLOG SLIDER
   ============================================================ */
window.slideBlog = (dir) => {
    const cards   = document.querySelectorAll('.blog-card');
    const visible = BLOG_VISIBLE();
    const maxIdx  = Math.max(0, cards.length - visible);

    if (dir === 'next' && blogIdx < maxIdx) blogIdx++;
    else if (dir === 'prev' && blogIdx > 0) blogIdx--;

    const card = cards[0];
    if (!card) return;
    const cardW = card.offsetWidth;
    const gap   = 24;
    document.getElementById('blog-grid').style.transform =
        `translateX(-${blogIdx * (cardW + gap)}px)`;
};

/* ============================================================
   HEXAGON BACKGROUND GENERATORS
   ============================================================ */
function genHexes(containerId, count = 15) {
    const h = document.getElementById(containerId);
    if (!h) return;
    for (let i = 0; i < count; i++) {
        const el  = document.createElement('div');
        el.className = containerId === 'contact-hive' ? 'contact-hex' : 'random-hex';
        const s = Math.floor(Math.random() * 100) + 40;
        el.style.cssText = `width:${s}px;height:${s * 1.1}px;top:${Math.floor(Math.random() * 90)}%;left:${Math.floor(Math.random() * 90)}%;`;
        h.appendChild(el);
    }
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast     = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

window.showToast = showToast;

/* ============================================================
   DOMContentLoaded — INIT
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
    genHexes('random-hive', 15);
    genHexes('contact-hive', 12);
    document.getElementById('year').textContent = new Date().getFullYear();
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const target = document.querySelector(link.getAttribute('href'));
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
        });
    });
});