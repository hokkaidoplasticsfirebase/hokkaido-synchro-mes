// --- SISTEMA DE AUTENTICAÇÃO ---
const firebaseConfig = {
    apiKey: "AIzaSyB1YrMK07_7QROsCJQqE0MFsmJncfjphmI",
    authDomain: "hokkaido-synchro.firebaseapp.com",
    projectId: "hokkaido-synchro",
    storageBucket: "hokkaido-synchro.firebasestorage.app",
    messagingSenderId: "635645564631",
    appId: "1:635645564631:web:1e19be7957e39d1adc8292"
};

// Initialize Firebase
let db, auth;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    auth = firebase.auth();
} catch (error) {
    console.error("Erro ao inicializar Firebase: ", error);
}

// DOM Elements
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginButton = document.getElementById('login-button');
const logoutBtn = document.getElementById('logout-btn');
const userDisplayName = document.getElementById('user-display-name');
const userRoleDisplay = document.getElementById('user-role-display');

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userRole = await getUserRole(user.uid);
        setupUIForUser(userRole);
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        userDisplayName.textContent = user.displayName || user.email;
        userRoleDisplay.textContent = userRole;
    } else {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        detachActiveListener();
    }
});

// Get User Role
async function getUserRole(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        return userDoc.exists ? userDoc.data().role || 'operador' : 'operador';
    } catch (error) {
        console.error("Error fetching user role: ", error);
        return 'operador';
    }
}

// Setup UI based on role
function setupUIForUser(role) {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    if (role === 'operador') {
        navButtons.forEach(btn => {
            if (btn.dataset.page !== 'lancamento') {
                btn.classList.add('hidden');
            }
        });
        // Activate lancamento page
        const lancamentoBtn = document.querySelector('.nav-btn[data-page="lancamento"]');
        const lancamentoPage = document.getElementById('lancamento-page');
        if (lancamentoBtn) lancamentoBtn.classList.add('active');
        if (lancamentoPage) lancamentoPage.classList.remove('hidden');
        pageTitle.textContent = 'Lançamento';
        listenToCurrentProductionPlan();
    } else {
        // gestor or lider - full access
        navButtons.forEach(btn => btn.classList.remove('hidden'));
        const firstNavBtn = document.querySelector('.nav-btn:not(.hidden)');
        if (firstNavBtn) firstNavBtn.click();
    }
    lucide.createIcons();
}

// Login Handler
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;
        loginError.textContent = '';
        loginButton.disabled = true;
        loginButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-5 h-5"></i> <span>Aguarde...</span>`;
        lucide.createIcons();
        
        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                console.error("Login error:", error);
                loginError.textContent = 'Email ou senha inválidos.';
            })
            .finally(() => {
                loginButton.disabled = false;
                loginButton.innerHTML = `<i data-lucide="log-in" class="w-5 h-5"></i> <span>Entrar</span>`;
                lucide.createIcons();
            });
    });
}

// Logout Handler
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });
}// This file contains the full and correct JavaScript code for the Hokkaido Synchro MES application.
// All functionalities, including the new database with product codes, are implemented here.
// VERSION 9.0: Added Firebase Authentication and role-based access control.

document.addEventListener('DOMContentLoaded', function() {
    // --- START: NEW AUTHENTICATION CODE ---
    
    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyB1YrMK07_7QROsCJQqE0MFsmJncfjphmI",
        authDomain: "hokkaido-synchro.firebaseapp.com",
        projectId: "hokkaido-synchro",
        storageBucket: "hokkaido-synchro.firebasestorage.app",
        messagingSenderId: "635645564631",
        appId: "1:635645564631:web:1e19be7957e39d1adc8292"
    };

    // Initialize Firebase and services
    let db, auth;
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        auth = firebase.auth();
    } catch (error) {
        console.error("Erro ao inicializar Firebase: ", error);
        alert("Erro fatal: Não foi possível conectar aos serviços Firebase.");
        return;
    }

    // DOM Selectors for Auth
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const loginButton = document.getElementById('login-button');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplayName = document.getElementById('user-display-name');
    const userRoleDisplay = document.getElementById('user-role-display');

    // Auth State Changed Listener - Controls what is visible on the page
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // User is signed in
            const userRole = await getUserRole(user.uid);
            
            // Show user info
            userDisplayName.textContent = user.displayName || user.email;
            userRoleDisplay.textContent = userRole;

            // Configure UI based on role
            setupUIForUser(userRole);
            
            // Show app and hide login
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            appContainer.classList.add('flex'); // Use flex to match original layout
        } else {
            // User is signed out
            loginContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
            appContainer.classList.remove('flex');
            
            // Clear any active data listeners
            detachActiveListener();
        }
    });

    // Function to get user role from Firestore
    async function getUserRole(uid) {
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists && userDoc.data().role) {
                return userDoc.data().role; // 'operador' or 'gestor'
            } else {
                console.warn(`User document not found or role not set for UID: ${uid}. Defaulting to 'operador'.`);
                return 'operador'; // Default to least privileged role for security
            }
        } catch (error) {
            console.error("Error fetching user role: ", error);
            return 'operador'; // Default on error
        }
    }

    // Function to configure UI based on user role
    function setupUIForUser(role) {
        navButtons.forEach(btn => btn.classList.remove('active', 'hidden'));
        pageContents.forEach(content => content.classList.add('hidden'));

        if (role === 'operador') {
            // Hide all nav buttons except 'Lançamento'
            navButtons.forEach(btn => {
                if (btn.dataset.page !== 'lancamento') {
                    btn.classList.add('hidden');
                }
            });
            // Show and activate the 'Lançamento' page
            const lancamentoBtn = document.querySelector('.nav-btn[data-page="lancamento"]');
            const lancamentoPage = document.getElementById('lancamento-page');
            
            if (lancamentoBtn) lancamentoBtn.classList.add('active');
            if (lancamentoPage) lancamentoPage.classList.remove('hidden');
            
            pageTitle.textContent = 'Lançamento';
            listenToCurrentProductionPlan(); // Initialize data for the operator's view

        } else { // 'gestor' or any other role with full access
            // Show all nav buttons
            navButtons.forEach(btn => btn.classList.remove('hidden'));
            
            // Click the first button to show the default page for managers
            const firstNavBtn = document.querySelector('.nav-btn:not(.hidden)');
            if (firstNavBtn) {
                firstNavBtn.click();
            }
        }
        lucide.createIcons();
    }

    // Login form submission
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;
            loginError.textContent = '';
            loginButton.disabled = true;
            loginButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-5 h-5"></i> <span>Aguarde...</span>`;
            lucide.createIcons();
            
            auth.signInWithEmailAndPassword(email, password)
                .catch(error => {
                    console.error("Login error:", error.code, error.message);
                    loginError.textContent = 'Email ou senha inválidos.';
                })
                .finally(() => {
                    loginButton.disabled = false;
                    loginButton.innerHTML = `<i data-lucide="log-in" class="w-5 h-5"></i> <span>Entrar</span>`;
                    lucide.createIcons();
                });
        });
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }

    // --- END: NEW AUTHENTICATION CODE ---

    // --- Configuration Lists ---
    const machineList = [
        "H-01", "H-02", "H-03", "H-04", "H-05", "H-06", "H-07", "H-08", "H-09", "H-10",
        "H-11", "H-12", "H-13", "H-14", "H-15", "H-16", "H-17", "H-18", "H-19", "H-20",
        "H-26", "H-27", "H-28", "H-29", "H-30", "H-31", "H-32"
    ];

    const lossReasons = [
        "BOLHA", "CHUPAGEM", "CONTAMINAÇÃO", "DEGRADAÇÃO", "EMPENAMENTO", "FALHA", 
        "FIAPO", "FORA DE COR", "INÍCIO/REÍNICIO", "JUNÇÃO", "MANCHAS", 
        "MEDIDA FORA DO ESPECIFICADO", "MOÍDO", "PEÇAS PERDIDAS", "QUEIMA", "REBARBA",
        "DEFORMAÇÃO", "GALHO PRESO", "MARCA D'ÁGUA", "MARCA EXTRATOR", "RISCOS", "SUJIDADE",
        "INSPEÇÃO DE LINHA"
    ];

    const downtimeReasons = [
        "CORRETIVA DE MOLDE", "PREVENTIVA DE MOLDE", "TROCA DE VERSÃO", "ABERTURA DE CAVIDADE", 
        "AJUSTE DE PROCESSO", "TRY OUT", "FALTA DE INSUMO PLANEJADA", "FALTA DE INSUMO NÃO PLANEJADA",
        "AGUARDANDO PREPARAÇÃO DE MATERIAL", "AGUARDANDO CLIENTE/FORNECEDOR", "LIBERAÇÃO",
        "MANUTENÇÃO CORRETIVA", "MANUTENÇÃO PREVENTIVA", "FALTA DE OPERADOR", "TROCA DE COR",
        "INSTALAÇÃO DE MOLDE", "RETIRADA DE MOLDE", "FALTA DE ENERGIA", "SEM PROGRAMAÇÃO", "SEM PEDIDO"
    ];

    const preparadores = ['Daniel', 'João', 'Luis', 'Manaus', 'Rafael', 'Stanley', 'Wagner', 'Yohan'].sort();
    
    // Global Variables
    let activeListenerUnsubscribe = null;
    let currentAnalysisView = 'resumo';
    let docIdToDelete = null;
    let collectionToDelete = null;
    let fullDashboardData = { perdas: [] };
    let paretoChartInstance, productionTimelineChartInstance, oeeByShiftChartInstance;
    let currentReportData = [];

    // DOM Element Selectors
    const navButtons = document.querySelectorAll('.nav-btn');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('page-title');
    const confirmModal = document.getElementById('confirm-modal');
    
    const sidebar = document.getElementById('sidebar');
    const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const planningDateSelector = document.getElementById('planning-date-selector');
    const planningForm = document.getElementById('planning-form');
    const planningTableBody = document.getElementById('planning-table-body');
    const planningMachineSelect = document.getElementById('planning-machine');
    const leaderLaunchPanel = document.getElementById('leader-launch-panel');
    const leaderModal = document.getElementById('leader-entry-modal');
    const leaderModalForm = document.getElementById('leader-entry-form');
    const leaderModalTitle = document.getElementById('leader-modal-title');
    
    const launchPanelContainer = document.getElementById('launch-panel-container');
    const productionModal = document.getElementById('production-entry-modal');
    const productionModalForm = document.getElementById('production-entry-form');
    const productionModalTitle = document.getElementById('production-modal-title');
    
    const rcaForm = document.getElementById('rca-form');
    const rcaListContainer = document.getElementById('rca-list-container');

    const downtimeForm = document.getElementById('downtime-form');
    const downtimeDate = document.getElementById('downtime-date');
    const downtimeMachineSelect = document.getElementById('downtime-machine');
    const downtimeReasonSelect = document.getElementById('downtime-reason');
    const downtimeListDate = document.getElementById('downtime-list-date');
    const downtimeTableContainer = document.getElementById('downtime-table-container');
    
    const analysisTabButtons = document.querySelectorAll('.analysis-tab-btn');
    const analysisViews = document.querySelectorAll('.analysis-view');
    const resumoDateSelector = document.getElementById('resumo-date-selector');
    const printReportBtn = document.getElementById('print-report-btn');
    const reportQuantBtn = document.getElementById('report-quant-btn');
    const reportEfficBtn = document.getElementById('report-effic-btn');
    const resumoContentContainer = document.getElementById('resumo-content-container');
    const startDateSelector = document.getElementById('start-date-selector');
    const endDateSelector = document.getElementById('end-date-selector');
    const dateRangeButtons = document.querySelectorAll('.date-range-btn');
    const machineFilter = document.getElementById('machine-filter');
    const refreshDashboardBtn = document.getElementById('refresh-dashboard-btn');
    
    const chartToggleProdBtn = document.getElementById('chart-toggle-prod');
    const chartToggleOeeBtn = document.getElementById('chart-toggle-oee');
    const productionChartContainer = document.getElementById('production-chart-container');
    const oeeChartContainer = document.getElementById('oee-chart-container');
    const graphMachineFilter = document.getElementById('graph-machine-filter');

    // --- FUNÇÕES UTILITÁRIAS ---
    function getGroupedLossReasons() {
        return {
            "PROCESSO": ["BOLHA", "CHUPAGEM", "CONTAMINAÇÃO", "DEGRADAÇÃO", "EMPENAMENTO", "FALHA", "FIAPO", "FORA DE COR", "INÍCIO/REÍNICIO", "JUNÇÃO", "MANCHAS", "MEDIDA FORA DO ESPECIFICADO", "MOÍDO", "PEÇAS PERDIDAS", "QUEIMA", "REBARBA"],
            "FERRAMENTARIA": ["DEFORMAÇÃO", "GALHO PRESO", "MARCA D'ÁGUA", "MARCA EXTRATOR", "RISCOS", "SUJIDADE"],
            "QUALIDADE": ["INSPEÇÃO DE LINHA"]
        };
    }

    function getGroupedDowntimeReasons() {
        return {
            "FERRAMENTARIA": ["CORRETIVA DE MOLDE", "PREVENTIVA DE MOLDE", "TROCA DE VERSÃO"],
            "PROCESSO": ["ABERTURA DE CAVIDADE", "AJUSTE DE PROCESSO", "TRY OUT"],
            "COMPRAS": ["FALTA DE INSUMO PLANEJADA", "FALTA DE INSUMO NÃO PLANEJADA"],
            "PREPARAÇÃO": ["AGUARDANDO PREPARAÇÃO DE MATERIAL"],
            "QUALIDADE": ["AGUARDANDO CLIENTE/FORNECEDOR", "LIBERAÇÃO"],
            "MANUTENÇÃO": ["MANUTENÇÃO CORRETIVA", "MANUTENÇÃO PREVENTIVA"],
            "PRODUÇÃO": ["FALTA DE OPERADOR", "TROCA DE COR"],
            "SETUP": ["INSTALAÇÃO DE MOLDE", "RETIRADA DE MOLDE"],
            "ADMINISTRATIVO": ["FALTA DE ENERGIA"],
            "PCP": ["SEM PROGRAMAÇÃO"],
            "COMERCIAL": ["SEM PEDIDO"]
        };
    }

    function populateLossOptions() {
        const perdasSelect = document.getElementById('production-entry-perdas');
        if (!perdasSelect) return;
        
        const groupedReasons = getGroupedLossReasons();
        let options = '<option value="">Nenhum</option>';
        Object.entries(groupedReasons).forEach(([group, reasons]) => {
            options += `<optgroup label="${group}">`;
            reasons.forEach(reason => options += `<option value="${reason}">${reason}</option>`);
            options += `</optgroup>`;
        });
        perdasSelect.innerHTML = options;
    }

    function showLoadingState(panel, isLoading, noData = false) {
        const loadingEl = document.getElementById(`${panel}-loading`);
        const noDataEl = document.getElementById(`${panel}-no-data`);
        const contentEl = panel === 'leader-panel' ? leaderLaunchPanel : 
                        panel === 'launch-panel' ? launchPanelContainer : 
                        panel === 'resumo' ? resumoContentContainer :
                        panel === 'downtime-list' ? downtimeTableContainer :
                        document.getElementById('dashboard-content');

        if (isLoading) {
            if (loadingEl) loadingEl.style.display = 'block';
            if (noDataEl) noDataEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'none';
        } else {
            if (loadingEl) loadingEl.style.display = 'none';
            if (noData) {
                if (noDataEl) noDataEl.style.display = 'block';
                if (contentEl) contentEl.style.display = 'none';
            } else {
                if (noDataEl) noDataEl.style.display = 'none';
                if (contentEl) {
                    const displayStyle = (panel.includes('dashboard') || panel.includes('resumo') || panel.includes('list')) ? 'block' : 'grid';
                    contentEl.style.display = displayStyle;
                }
            }
        }
    }

    function showConfirmModal(id, collection) {
        docIdToDelete = id;
        collectionToDelete = collection;
        const confirmText = document.getElementById('confirm-modal-text');
        if (confirmText) {
            confirmText.textContent = collection === 'downtime_entries' ? 
                'Tem a certeza de que deseja excluir este registro de parada? Esta ação não pode ser desfeita.' :
                'Tem a certeza de que deseja excluir este item? Todos os lançamentos associados também serão removidos.';
        }
        if (confirmModal) confirmModal.classList.remove('hidden');
    }
    
    function hideConfirmModal() {
        docIdToDelete = null;
        collectionToDelete = null;
        if (confirmModal) confirmModal.classList.add('hidden');
    }
    
    async function executeDelete() {
        if (!docIdToDelete || !collectionToDelete) return;
        try {
            if (collectionToDelete === 'planning') {
                const prodEntriesSnapshot = await db.collection('production_entries').where('planId', '==', docIdToDelete).get();
                const batch = db.batch();
                prodEntriesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            await db.collection(collectionToDelete).doc(docIdToDelete).delete();
            
            if (pageTitle.textContent === 'Análise' && currentAnalysisView === 'resumo') loadResumoData();
            if (pageTitle.textContent === 'Parada de Máquina') listenToDowntimeChanges(downtimeListDate.value);
        } catch (error) {
            console.error("Erro ao excluir: ", error);
            alert("Não foi possível excluir o item e/ou seus dados associados.");
        } finally {
            hideConfirmModal();
        }
    }

    const taraBoxesDatabase = { "H-01":{peso:0,descricao:"caixa plastica"},"H-02":{peso:0,descricao:"caixa plastica"},"H-03":{peso:0,descricao:"caixa plastica"},"H-04":{peso:0,descricao:"caixa plastica"},"H-05":{peso:0,descricao:"caixa plastica"},"H-06":{peso:0,descricao:"caixa plastica"},"H-07":{peso:0,descricao:"caixa plastica"},"H-08":{peso:0,descricao:"caixa plastica"},"H-09":{peso:0,descricao:"caixa plastica"},"H-10":{peso:0,descricao:"caixa plastica"},"H-11":{peso:0,descricao:"caixa plastica"},"H-12":{peso:0,descricao:"caixa plastica"},"H-13":{peso:0,descricao:"caixa plastica"},"H-14":{peso:0,descricao:"caixa plastica"},"H-15":{peso:0,descricao:"caixa plastica"},"H-16":{peso:0,descricao:"caixa plastica"},"H-17":{peso:0,descricao:"caixa plastica"},"H-18":{peso:0,descricao:"caixa plastica"},"H-19":{peso:0,descricao:"caixa plastica"},"H-20":{peso:0,descricao:"caixa plastica"},"H-26":{peso:0,descricao:"caixa plastica"},"H-27":{peso:0,descricao:"caixa plastica"},"H-28":{peso:0,descricao:"caixa plastica"},"H-29":{peso:0,descricao:"caixa plastica"},"H-30":{peso:0,descricao:"caixa plastica"},"H-31":{peso:0,descricao:"caixa plastica"},"H-32":{peso:0,descricao:"caixa plastica"} };

    async function loadHourlyEntries(planId, turno) {
        const entriesRef = db.collection('hourly_production_entries');
        const q = entriesRef.where('planId', '==', planId).where('turno', '==', turno);
        const querySnapshot = await q.get();
        const entriesContainer = document.getElementById('hourly-entries-container');
        if (!entriesContainer) return;
        entriesContainer.innerHTML = '';
        const hours=["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00"];
        const existingEntries = {};
        querySnapshot.forEach(doc => { const data = doc.data(); existingEntries[data.hora] = { id: doc.id, ...data }; });
        hours.forEach(hora => {
            const entry = existingEntries[hora] || { hora, peso_bruto: '', usar_tara: false };
            const entryElement = createHourlyEntryElement(entry, planId, turno);
            entriesContainer.appendChild(entryElement);
        });
        updateTotalCalculation();
        lucide.createIcons();
    }

    function createHourlyEntryElement(entry, planId, turno) {
        const div = document.createElement('div');
        div.className = 'hourly-entry grid grid-cols-12 gap-2 items-center p-2 border-b text-sm';
        div.innerHTML = `
            <div class="col-span-2 font-medium">${entry.hora}</div>
            <div class="col-span-3"><input type="number" step="0.01" value="${entry.peso_bruto || ''}" placeholder="Peso bruto (kg)" class="peso-bruto-input w-full p-1 border rounded" data-hora="${entry.hora}"></div>
            <div class="col-span-2 flex items-center"><input type="checkbox" ${entry.usar_tara ? 'checked' : ''} class="usar-tara-checkbox mr-1" data-hora="${entry.hora}"><span class="text-xs">Usar Tara</span></div>
            <div class="col-span-3"><span class="pecas-calculadas text-sm font-semibold">0 peças</span></div>
            <div class="col-span-2">${entry.id ? `<button type="button" class="delete-hourly-entry text-red-600 hover:text-red-800" data-id="${entry.id}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}</div>`;
        return div;
    }

    async function getPieceWeightFromPlan(planId) {
        try {
            const planDoc = await db.collection('planning').doc(planId).get();
            return planDoc.exists ? planDoc.data().piece_weight || 0 : 0;
        } catch (error) {
            console.error("Erro ao buscar peso da peça:", error);
            return 0;
        }
    }

    async function updateTotalCalculation() {
        const planId = document.getElementById('production-entry-plan-id').value;
        const pieceWeight = await getPieceWeightFromPlan(planId);
        const useTara = document.getElementById('use-tara-box').checked;
        const taraWeight = parseFloat(document.getElementById('tara-box-weight').value) || 0;
        let totalPesoLiquido = 0, totalPecas = 0;
        
        document.querySelectorAll('.hourly-entry').forEach(entry => {
            const pesoBruto = parseFloat(entry.querySelector('.peso-bruto-input').value) || 0;
            const usarTara = entry.querySelector('.usar-tara-checkbox').checked;
            const pesoLiquido = usarTara && useTara ? Math.max(0, pesoBruto - taraWeight) : pesoBruto;
            const pecas = pieceWeight > 0 ? Math.round((pesoLiquido * 1000) / pieceWeight) : 0;
            if (entry.querySelector('.pecas-calculadas')) entry.querySelector('.pecas-calculadas').textContent = `${pecas} peças`;
            totalPesoLiquido += pesoLiquido;
            totalPecas += pecas;
        });
        
        const totalPesoLiquidoEl = document.getElementById('total-peso-liquido');
        const totalPecasEl = document.getElementById('total-pecas');
        const produzidoInput = document.getElementById('production-entry-produzido');
        if (totalPesoLiquidoEl) totalPesoLiquidoEl.textContent = `${totalPesoLiquido.toFixed(2)} kg`;
        if (totalPecasEl) totalPecasEl.textContent = totalPecas.toLocaleString('pt-BR');
        if (produzidoInput) produzidoInput.value = totalPecas;
    }

    async function saveHourlyEntries(planId, turno) {
        const batch = db.batch();
        // First, delete existing entries for this planId and turno to avoid duplicates
        const existingEntriesSnapshot = await db.collection('hourly_production_entries')
                                                .where('planId', '==', planId)
                                                .where('turno', '==', turno)
                                                .get();
        existingEntriesSnapshot.forEach(doc => batch.delete(doc.ref));

        // Now, add the new/updated entries
        document.querySelectorAll('.hourly-entry').forEach(entry => {
            const hora = entry.querySelector('.peso-bruto-input').dataset.hora;
            const pesoBruto = parseFloat(entry.querySelector('.peso-bruto-input').value) || 0;
            const usarTara = entry.querySelector('.usar-tara-checkbox').checked;
            if (pesoBruto > 0) {
                const entryData = {
                    planId, turno, hora,
                    peso_bruto: pesoBruto,
                    usar_tara: usarTara,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                const docRef = db.collection('hourly_production_entries').doc();
                batch.set(docRef, entryData);
            }
        });
        await batch.commit();
    }

    // --- INITIALIZATION ---
    function init() {
        setTodayDate();
        setupEventListeners();
        setupPlanningTab();
        setupDowntimeTab();
        populateLossOptions();
        
        if (productionModalForm && !document.getElementById('production-entry-plan-id')) {
            const planIdInput = document.createElement('input');
            planIdInput.type = 'hidden';
            planIdInput.id = 'production-entry-plan-id';
            planIdInput.name = 'planId';
            productionModalForm.prepend(planIdInput);
        }
        lucide.createIcons();
    }

    function getProductionDateString(date = new Date()) {
        const localDate = new Date(date);
        if (localDate.getHours() < 7) localDate.setDate(localDate.getDate() - 1);
        return new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    }

    function setTodayDate() {
        const todayString = getProductionDateString();
        if (planningDateSelector) planningDateSelector.value = todayString;
        if (resumoDateSelector) resumoDateSelector.value = todayString;
        if (downtimeDate) downtimeDate.value = todayString;
        if (downtimeListDate) downtimeListDate.value = todayString;
        if (startDateSelector) startDateSelector.value = todayString;
        if (endDateSelector) endDateSelector.value = todayString;
    }

    function setupEventListeners() {
        navButtons.forEach(button => button.addEventListener('click', handleNavClick));
        analysisTabButtons.forEach(button => button.addEventListener('click', handleAnalysisTabClick));
        
        if (sidebarOpenBtn) sidebarOpenBtn.addEventListener('click', openSidebar);
        if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
        if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

        if (planningForm) planningForm.addEventListener('submit', handlePlanningFormSubmit);
        if (planningDateSelector) planningDateSelector.addEventListener('change', (e) => listenToPlanningChanges(e.target.value));
        
        const productCodSelect = document.getElementById('planning-product-cod');
        if (productCodSelect) productCodSelect.addEventListener('change', onPlanningProductCodChange);
        
        if (planningTableBody) planningTableBody.addEventListener('click', handlePlanningTableClick);
        if (leaderLaunchPanel) leaderLaunchPanel.addEventListener('click', handleLeaderPanelClick);
        if (leaderModal) leaderModal.querySelector('#leader-modal-close-btn').addEventListener('click', hideLeaderModal);
        if (leaderModalForm) leaderModalForm.addEventListener('submit', handleLeaderEntrySubmit);
        
        if (launchPanelContainer) launchPanelContainer.addEventListener('click', handleLaunchPanelClick);
        if (productionModal) {
            productionModal.querySelector('#production-modal-close-btn').addEventListener('click', hideProductionModal);
            productionModal.querySelector('#production-modal-cancel-btn').addEventListener('click', hideProductionModal);
        }
        if (productionModalForm) productionModalForm.addEventListener('submit', handleProductionEntrySubmit);
        
        if (rcaForm) rcaForm.addEventListener('submit', handleRcaFormSubmit);
        if (downtimeForm) downtimeForm.addEventListener('submit', handleDowntimeFormSubmit);
        if (downtimeListDate) downtimeListDate.addEventListener('change', (e) => listenToDowntimeChanges(e.target.value));
        if (downtimeDate) downtimeDate.addEventListener('change', (e) => updateDowntimeMachineList(e.target.value));
        
        if (resumoDateSelector) resumoDateSelector.addEventListener('change', loadResumoData);
        if (printReportBtn) printReportBtn.addEventListener('click', handlePrintReport);
        if (reportQuantBtn) reportQuantBtn.addEventListener('click', () => switchReportView('quant'));
        if (reportEfficBtn) reportEfficBtn.addEventListener('click', () => switchReportView('effic'));
        if (resumoContentContainer) resumoContentContainer.addEventListener('click', handleResumoTableClick);
        
        if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', loadDashboardData);
        if (machineFilter) machineFilter.addEventListener('change', () => processAndRenderDashboard(fullDashboardData));
        if (graphMachineFilter) graphMachineFilter.addEventListener('change', () => processAndRenderDashboard(fullDashboardData));
        
        dateRangeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                dateRangeButtons.forEach(btn => btn.classList.remove('active'));
                e.currentTarget.classList.add('active');
                setDateRange(e.currentTarget.dataset.range);
            });
        });

        if (chartToggleProdBtn) chartToggleProdBtn.addEventListener('click', () => toggleDashboardChart('prod'));
        if (chartToggleOeeBtn) chartToggleOeeBtn.addEventListener('click', () => toggleDashboardChart('oee'));

        if (confirmModal) {
            document.getElementById('confirm-modal-cancel-btn').addEventListener('click', hideConfirmModal);
            document.getElementById('confirm-modal-ok-btn').addEventListener('click', executeDelete);
        }

        document.addEventListener('input', e => { if (e.target.classList.contains('peso-bruto-input')) updateTotalCalculation(); });
        document.addEventListener('change', e => { if (e.target.classList.contains('usar-tara-checkbox') || e.target.id === 'use-tara-box') updateTotalCalculation(); });
        
        document.addEventListener('click', async e => {
            const deleteButton = e.target.closest('.delete-hourly-entry');
            if (deleteButton) {
                deleteButton.closest('.hourly-entry').querySelector('.peso-bruto-input').value = '';
                updateTotalCalculation();
            }
        });
    }

    function detachActiveListener() {
        if (activeListenerUnsubscribe) {
            if (typeof activeListenerUnsubscribe === 'function') activeListenerUnsubscribe();
            else if (typeof activeListenerUnsubscribe === 'object') {
                Object.values(activeListenerUnsubscribe).forEach(unsub => { if (typeof unsub === 'function') unsub(); });
            }
            activeListenerUnsubscribe = null;
        }
    }

    function handleNavClick(e) {
        e.preventDefault();
        const page = e.currentTarget.dataset.page;
        
        navButtons.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        pageContents.forEach(content => content.classList.toggle('hidden', content.id !== `${page}-page`));
        
        if (pageTitle) pageTitle.textContent = e.currentTarget.querySelector('span').textContent;
        
        detachActiveListener();

        if (page === 'lancamento') listenToCurrentProductionPlan();
        if (page === 'planejamento') listenToPlanningChanges(planningDateSelector.value || getProductionDateString());
        if (page === 'melhoria') listenToRcaData();
        if (page === 'parada') {
            const date = downtimeListDate.value || getProductionDateString();
            listenToDowntimeChanges(date);
            updateDowntimeMachineList(date);
        }
        if (page === 'analise') loadAnalysisData();

        if (window.innerWidth < 768) closeSidebar();
    }
    
    function openSidebar() { if (sidebar && sidebarOverlay) { sidebar.classList.remove('-translate-x-full'); sidebarOverlay.classList.remove('hidden'); } }
    function closeSidebar() { if (sidebar && sidebarOverlay) { sidebar.classList.add('-translate-x-full'); sidebarOverlay.classList.add('hidden'); } }

    function handleAnalysisTabClick(e) {
        const view = e.currentTarget.dataset.view;
        currentAnalysisView = view;
        analysisTabButtons.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        analysisViews.forEach(v => v.classList.toggle('hidden', v.id !== `${view}-view`));
        loadAnalysisData();
    }

    function loadAnalysisData() {
        if (currentAnalysisView === 'resumo') loadResumoData();
        else loadDashboardData();
    }

    function setDateRange(range) {
        const end = new Date();
        const start = new Date();
        switch(range) {
            case '7': start.setDate(start.getDate() - 7); break;
            case '30': start.setDate(start.getDate() - 30); break;
            case 'month': start.setDate(1); break;
            default: start.setDate(start.getDate() - 7);
        }
        if (startDateSelector) startDateSelector.value = start.toISOString().split('T')[0];
        if (endDateSelector) endDateSelector.value = end.toISOString().split('T')[0];
    }
    
    function setupPlanningTab() {
        if (!planningMachineSelect) return;
        const machineOptions = machineList.map(m => `<option value="${m}">${m}</option>`).join('');
        planningMachineSelect.innerHTML = `<option value="">Selecione...</option>${machineOptions}`;
        const productCodSelect = document.getElementById('planning-product-cod');
        if (productCodSelect) {
            const sortedProducts = [...productDatabase].sort((a, b) => a.cod - b.cod);
            const productOptions = sortedProducts.map(p => `<option value="${p.cod}" data-client="${p.client}" data-name="${p.name}" data-cycle="${p.cycle}" data-cavities="${p.cavities}" data-weight="${p.weight}">${p.cod} - ${p.name} (${p.client})</option>`).join('');
            productCodSelect.innerHTML = `<option value="">Selecione...</option>${productOptions}`;
        }
    }

    function onPlanningProductCodChange(e) {
        const selectedOption = e.target.selectedOptions[0];
        const cycleInput = document.getElementById('budgeted-cycle');
        const cavitiesInput = document.getElementById('mold-cavities');
        const weightInput = document.getElementById('piece-weight');
        const plannedQtyInput = document.getElementById('planned-quantity');
        const productNameDisplay = document.getElementById('product-name-display');

        if (e.target.value && selectedOption) {
            const { client, name, cycle, cavities, weight } = selectedOption.dataset;
            if (cycleInput) cycleInput.value = parseFloat(cycle) || 0;
            if (cavitiesInput) cavitiesInput.value = parseInt(cavities) || 0;
            if (weightInput) weightInput.value = parseFloat(weight) || 0;
            if (plannedQtyInput) plannedQtyInput.value = Math.floor((86400 / (parseFloat(cycle) || 1)) * (parseInt(cavities) || 0) * 0.85);
            if (productNameDisplay) { productNameDisplay.textContent = `${name} (${client})`; productNameDisplay.style.display = 'block'; }
        } else {
            if (cycleInput) cycleInput.value = '';
            if (cavitiesInput) cavitiesInput.value = '';
            if (weightInput) weightInput.value = '';
            if (plannedQtyInput) plannedQtyInput.value = '';
            if (productNameDisplay) { productNameDisplay.textContent = ''; productNameDisplay.style.display = 'none'; }
        }
    }

    async function handlePlanningFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const product = productDatabase.find(p => p.cod == data.product_cod);
        if (!product) { alert('Produto não encontrado!'); return; }
        const statusMessage = document.getElementById('planning-status-message');
        const submitButton = document.getElementById('planning-submit-button');
        if (!submitButton) return;
        submitButton.disabled = true;
        submitButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i><span>A Adicionar...</span>`;
        lucide.createIcons();
        try {
            const docData = {
                date: data.date, machine: data.machine, product_cod: product.cod, client: product.client,
                product: product.name, budgeted_cycle: product.cycle, mold_cavities: product.cavities,
                piece_weight: parseFloat(data.piece_weight) || product.weight,
                planned_quantity: parseInt(data.planned_quantity),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('planning').add(docData);
            if (statusMessage) { statusMessage.textContent = 'Item adicionado com sucesso!'; statusMessage.className = 'text-status-success text-sm font-semibold h-5 text-center'; }
            form.reset();
            document.getElementById('budgeted-cycle').value = '';
            document.getElementById('mold-cavities').value = '';
            document.getElementById('piece-weight').value = '';
            document.getElementById('planned-quantity').value = '';
            const productNameDisplay = document.getElementById('product-name-display');
            if (productNameDisplay) { productNameDisplay.textContent = ''; productNameDisplay.style.display = 'none'; }
        } catch (error) {
            console.error("Erro ao adicionar planejamento: ", error);
            if (statusMessage) { statusMessage.textContent = 'Erro ao adicionar. Tente novamente.'; statusMessage.className = 'text-status-error text-sm font-semibold h-5 text-center'; }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i data-lucide="plus-circle"></i><span>Adicionar ao Plano</span>`;
            lucide.createIcons();
            if (statusMessage) setTimeout(() => statusMessage.textContent = '', 3000);
        }
    }

    function listenToPlanningChanges(date) {
        if (!date) return;
        detachActiveListener();
        showLoadingState('leader-panel', true);
        let planningItems = [], productionEntries = [];
        const render = () => {
            const combinedData = planningItems.map(plan => {
                const data = { ...plan, T1: {}, T2: {}, T3: {} };
                ['T1', 'T2', 'T3'].forEach(turno => {
                    const entries = productionEntries.filter(p => p.planId === plan.id && p.turno === turno);
                    data[turno] = { produzido: entries.reduce((sum, item) => sum + item.produzido, 0) };
                });
                data.total_produzido = (data.T1.produzido || 0) + (data.T2.produzido || 0) + (data.T3.produzido || 0);
                return data;
            });
            renderPlanningTable(combinedData);
            renderLeaderPanel(planningItems);
            showLoadingState('leader-panel', false, planningItems.length === 0);
        };
        const planningListener = db.collection('planning').where('date', '==', date).onSnapshot(snapshot => {
            planningItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
            render();
        }, error => {
            console.error("Erro ao carregar planejamentos:", error);
            if(leaderLaunchPanel) leaderLaunchPanel.innerHTML = `<div class="col-span-full text-center text-red-600">Erro ao carregar dados.</div>`;
            showLoadingState('leader-panel', false, true);
        });
        const entriesListener = db.collection('production_entries').where('data', '==', date).onSnapshot(snapshot => {
            productionEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            render();
        }, error => console.error("Erro ao carregar lançamentos:", error));
        activeListenerUnsubscribe = { planningListener, entriesListener };
    }

    function renderPlanningTable(items) {
        if (!planningTableBody) return;
        const orDash = val => val || '-';
        const orDashNum = val => val ? val.toLocaleString('pt-BR') : '-';
        const cycleClass = (real, budget) => (!real || !budget) ? '' : real > budget ? 'text-status-error font-bold' : '';
        planningTableBody.innerHTML = items.map(item => `
            <tr class="hover:bg-gray-50 text-center text-sm">
                <td class="px-2 py-2 whitespace-nowrap border text-left">${item.machine}</td>
                <td class="px-2 py-2 whitespace-nowrap border text-left">${item.product}</td>
                <td class="px-2 py-2 whitespace-nowrap border">${orDash(item.budgeted_cycle)}</td>
                <td class="px-2 py-2 whitespace-nowrap border">${orDash(item.mold_cavities)}</td>
                <td class="px-2 py-2 whitespace-nowrap border">${orDash(item.piece_weight)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-blue-50 ${cycleClass(item.real_cycle_t1, item.budgeted_cycle)}">${orDash(item.real_cycle_t1)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-blue-50">${orDash(item.active_cavities_t1)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-blue-50">${orDashNum(item.T1?.produzido)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-yellow-50 ${cycleClass(item.real_cycle_t2, item.budgeted_cycle)}">${orDash(item.real_cycle_t2)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-yellow-50">${orDash(item.active_cavities_t2)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-yellow-50">${orDashNum(item.T2?.produzido)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-purple-50 ${cycleClass(item.real_cycle_t3, item.budgeted_cycle)}">${orDash(item.real_cycle_t3)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-purple-50">${orDash(item.active_cavities_t3)}</td>
                <td class="px-2 py-2 whitespace-nowrap border bg-purple-50">${orDashNum(item.T3?.produzido)}</td>
                <td class="px-2 py-2 whitespace-nowrap border font-bold">${orDashNum(item.total_produzido)}</td>
                <td class="px-2 py-2 whitespace-nowrap border">${item.machine}</td>
                <td class="px-2 py-2 whitespace-nowrap border no-print"><button data-id="${item.id}" class="delete-plan-btn text-status-error hover:text-red-700 p-1 mx-auto flex"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            </tr>`).join('');
        lucide.createIcons();
    }

    function handlePlanningTableClick(e) { const btn = e.target.closest('.delete-plan-btn'); if (btn) showConfirmModal(btn.dataset.id, 'planning'); }
    
    function renderLeaderPanel(planItems) {
        if (!leaderLaunchPanel) return;
        leaderLaunchPanel.innerHTML = planItems.map(item => {
            const turnos = ['T1', 'T2', 'T3'];
            const statusHtml = turnos.map(turno => {
                const isComplete = item[`real_cycle_${turno.toLowerCase()}`] && item[`active_cavities_${turno.toLowerCase()}`];
                const statusClass = isComplete ? 'bg-green-100 text-status-success' : 'bg-yellow-100 text-status-warning';
                const statusIcon = isComplete ? `<i data-lucide="check-circle-2" class="w-4 h-4"></i>` : `<i data-lucide="alert-circle" class="w-4 h-4"></i>`;
                return `<div class="flex items-center justify-center gap-2 p-1 rounded-md text-xs font-semibold ${statusClass}">${statusIcon} ${turno}</div>`;
            }).join('');
            const btnClasses = turnos.map(turno => item[`real_cycle_${turno.toLowerCase()}`] && item[`active_cavities_${turno.toLowerCase()}`] ? 'bg-status-success hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600');
            return `
                <div class="border rounded-lg p-4 shadow-md flex flex-col justify-between bg-white">
                    <div>
                        <h3 class="font-bold text-lg">${item.machine}</h3><p class="text-sm text-gray-600">${item.product}</p>
                        <div class="grid grid-cols-3 gap-2 mt-2">${statusHtml}</div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-4">
                        <button data-id="${item.id}" data-turno="T1" class="setup-btn ${btnClasses[0]} text-white font-bold py-2 px-3 rounded-lg text-sm">1º Turno</button>
                        <button data-id="${item.id}" data-turno="T2" class="setup-btn ${btnClasses[1]} text-white font-bold py-2 px-3 rounded-lg text-sm">2º Turno</button>
                        <button data-id="${item.id}" data-turno="T3" class="setup-btn ${btnClasses[2]} text-white font-bold py-2 px-3 rounded-lg text-sm">3º Turno</button>
                    </div>
                </div>`;
        }).join('');
        lucide.createIcons();
    }
    
    function handleLeaderPanelClick(e) { const btn = e.target.closest('.setup-btn'); if (btn) showLeaderModal(btn.dataset.id, btn.dataset.turno); }

    async function showLeaderModal(docId, turno) {
        if (!leaderModalForm || !leaderModalTitle) return;
        leaderModalForm.innerHTML = `
            <input type="hidden" id="leader-entry-doc-id" name="docId"><input type="hidden" id="leader-entry-turno" name="turno">
            <div><label for="leader-entry-real-cycle" class="block text-sm font-medium">Ciclo Real (${turno})</label><input type="number" id="leader-entry-real-cycle" name="real_cycle" step="0.1" class="mt-1 w-full p-2 border-gray-300 rounded-md"></div>
            <div><label for="leader-entry-active-cavities" class="block text-sm font-medium">Cavidades Ativas (${turno})</label><input type="number" id="leader-entry-active-cavities" name="active_cavities" step="1" class="mt-1 w-full p-2 border-gray-300 rounded-md"></div>
            <div class="mt-6 flex justify-end gap-3 pt-4 border-t">
                <button type="button" id="leader-modal-cancel-btn" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-6 rounded-lg">Cancelar</button>
                <button type="submit" class="bg-primary-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-lg">Salvar</button>
            </div>`;
        leaderModal.querySelector('#leader-modal-cancel-btn').addEventListener('click', hideLeaderModal);
        document.getElementById('leader-entry-doc-id').value = docId;
        document.getElementById('leader-entry-turno').value = turno;
        try {
            const doc = await db.collection('planning').doc(docId).get();
            if (doc.exists) {
                const data = doc.data();
                leaderModalTitle.textContent = `Lançamento: ${data.machine} - ${turno}`;
                document.getElementById('leader-entry-real-cycle').value = data[`real_cycle_${turno.toLowerCase()}`] || '';
                document.getElementById('leader-entry-active-cavities').value = data[`active_cavities_${turno.toLowerCase()}`] || '';
            }
        } catch (error) { console.error("Erro ao buscar dados do setup: ", error); }
        leaderModal.classList.remove('hidden');
    }
    
    function hideLeaderModal() { if (leaderModal) leaderModal.classList.add('hidden'); }

    async function handleLeaderEntrySubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const docId = formData.get('docId');
        const turno = formData.get('turno');
        const planDataToUpdate = {
            [`real_cycle_${turno.toLowerCase()}`]: parseFloat(formData.get('real_cycle')) || null,
            [`active_cavities_${turno.toLowerCase()}`]: parseInt(formData.get('active_cavities')) || null,
        };
        try {
            await db.collection('planning').doc(docId).update(planDataToUpdate);
            hideLeaderModal();
        } catch (error) { console.error("Erro ao salvar dados do líder: ", error); alert("Não foi possível salvar os dados. Tente novamente."); }
    }

    function listenToCurrentProductionPlan() {
        detachActiveListener();
        const date = getProductionDateString();
        showLoadingState('launch-panel', true);
        let planningItems = [], launchedEntries = new Set(), productionEntries = [];
        const render = () => { renderLaunchPanel(planningItems, launchedEntries, productionEntries); showLoadingState('launch-panel', false, planningItems.length === 0); };
        const planningListener = db.collection('planning').where('date', '==', date).onSnapshot(snapshot => {
            planningItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
            render();
        }, error => { if (launchPanelContainer) launchPanelContainer.innerHTML = `<div class="col-span-full text-center text-red-600 bg-red-50 p-4 rounded-lg"><p class="font-bold">Falha ao carregar dados.</p></div>`; });
        const entriesListener = db.collection('production_entries').where('data', '==', date).onSnapshot(snapshot => {
            launchedEntries = new Set();
            productionEntries = snapshot.docs.map(doc => doc.data());
            snapshot.forEach(doc => { const entry = doc.data(); if(entry.produzido > 0 || entry.refugo_kg > 0) launchedEntries.add(`${entry.planId}-${entry.turno}`); });
            render();
        }, error => console.error("Erro ao carregar lançamentos de produção: ", error));
        activeListenerUnsubscribe = { planningListener, entriesListener };
    }

    function renderLaunchPanel(planItems, launchedEntries, productionEntries) {
        if (!launchPanelContainer) return;
        launchPanelContainer.innerHTML = planItems.map(item => {
            const classFor = turno => launchedEntries.has(`${item.id}-${turno}`) ? 'bg-status-success hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600';
            const totalProduzido = productionEntries.filter(p => p.planId === item.id).reduce((sum, p) => sum + (p.produzido || 0), 0);
            const meta = item.planned_quantity || 0;
            const progresso = meta > 0 ? (totalProduzido / meta) * 100 : 0;
            const progressoCor = progresso < 50 ? 'bg-status-error' : progresso < 90 ? 'bg-status-warning' : 'bg-status-success';
            return `
            <div class="bg-gray-50 border rounded-lg p-4 shadow-sm flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start">
                        <div><h3 class="font-bold text-lg">${item.machine}</h3><p class="text-sm text-gray-600">${item.product}</p></div>
                        <span class="text-xs font-bold text-gray-500">${totalProduzido.toLocaleString('pt-BR')} / ${meta.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 mt-2"><div class="${progressoCor} h-2.5 rounded-full" style="width: ${Math.min(progresso, 100)}%"></div></div>
                </div>
                <div class="grid grid-cols-3 gap-2 mt-4">
                    <button data-id="${item.id}" data-turno="T1" class="launch-btn ${classFor('T1')} text-white font-bold py-2 rounded-md">Turno 1</button>
                    <button data-id="${item.id}" data-turno="T2" class="launch-btn ${classFor('T2')} text-white font-bold py-2 rounded-md">Turno 2</button>
                    <button data-id="${item.id}" data-turno="T3" class="launch-btn ${classFor('T3')} text-white font-bold py-2 rounded-md">Turno 3</button>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();
    }
    
    async function handleLaunchPanelClick(e) { const btn = e.target.closest('.launch-btn'); if (btn) showProductionModal(btn.dataset.id, btn.dataset.turno); }

    async function showProductionModal(planId, turno) {
        if (!productionModalForm || !productionModalTitle) return;
        productionModalForm.reset();
        document.getElementById('production-entry-plan-id').value = planId;
        document.getElementById('production-entry-turno').value = turno;
        try {
            const planDoc = await db.collection('planning').doc(planId).get();
            if (planDoc.exists) {
                const planData = planDoc.data();
                productionModalTitle.textContent = `Lançamento: ${planData.machine} - ${turno}`;
                document.getElementById('product-weight-info').textContent = `Peso da peça: ${planData.piece_weight || 0}g`;
                const taraData = taraBoxesDatabase[planData.machine];
                if (taraData) {
                    document.getElementById('tara-box-weight').value = taraData.peso;
                    document.getElementById('tara-box-info').textContent = taraData.descricao;
                }
            } else { throw new Error("Plano não encontrado."); }
            await loadHourlyEntries(planId, turno);
            productionModal.classList.remove('hidden');
        } catch(error) { console.error("Erro ao abrir modal de produção:", error); alert("Não foi possível carregar os dados. Tente novamente."); }
    }

    function hideProductionModal() { if (productionModal) productionModal.classList.add('hidden'); }

    async function handleProductionEntrySubmit(e) {
        e.preventDefault();
        const statusMessage = document.getElementById('production-modal-status');
        const saveButton = document.getElementById('production-modal-save-btn');
        if (!saveButton) return;
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando...';
        const formData = new FormData(productionModalForm);
        const planId = formData.get('planId');
        const turno = formData.get('turno');
        const data = {
            produzido: parseInt(formData.get('produzido')) || 0, duracao_min: 0, refugo_kg: parseFloat(formData.get('refugo')) || 0,
            borras_kg: parseFloat(formData.get('borras')) || 0, motivo_refugo: formData.get('perdas'),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        try {
            await saveHourlyEntries(planId, turno);
            const entriesRef = db.collection('production_entries');
            const q = entriesRef.where('planId', '==', planId).where('turno', '==', turno).limit(1);
            const querySnapshot = await q.get();
            if(querySnapshot.empty){
                const planDoc = await db.collection('planning').doc(planId).get();
                await entriesRef.add({ ...data, planId, turno, data: planDoc.data().date });
            } else {
                await querySnapshot.docs[0].ref.update(data);
            }
            if (statusMessage) { statusMessage.textContent = 'Lançamentos salvos com sucesso!'; statusMessage.className = 'text-green-600 text-sm font-semibold h-5 text-center'; }
            setTimeout(() => { hideProductionModal(); if (statusMessage) statusMessage.textContent = ''; }, 1500);
        } catch (error) {
            console.error("Erro ao salvar lançamentos: ", error);
            if (statusMessage) { statusMessage.textContent = 'Erro ao salvar. Tente novamente.'; statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center'; }
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Salvar Lançamentos';
        }
    }
    
    async function handleRcaFormSubmit(e) { e.preventDefault(); alert('Funcionalidade de Melhoria Contínua será implementada em breve.'); }
    function listenToRcaData() {}
    
    async function updateDowntimeMachineList(date) {
        if (!downtimeMachineSelect || !date) { if (downtimeMachineSelect) downtimeMachineSelect.innerHTML = '<option value="">Selecione uma data</option>'; return; }
        try {
            const planningSnapshot = await db.collection('planning').where('date', '==', date).get();
            const plannedMachines = [...new Set(planningSnapshot.docs.map(doc => doc.data().machine))].sort();
            if (plannedMachines.length > 0) {
                downtimeMachineSelect.innerHTML = '<option value="">Selecione...</option>' + plannedMachines.map(m => `<option value="${m}">${m}</option>`).join('');
            } else { downtimeMachineSelect.innerHTML = '<option value="">Nenhuma máquina planejada</option>'; }
        } catch (error) { console.error("Erro ao carregar máquinas planejadas: ", error); downtimeMachineSelect.innerHTML = '<option value="">Erro ao carregar</option>'; }
    }

    function setupDowntimeTab(){
        if (!downtimeReasonSelect) return;
        const groupedReasons = getGroupedDowntimeReasons();
        let reasonOptions = '<option value="">Selecione...</option>';
        Object.entries(groupedReasons).forEach(([group, reasons]) => {
            reasonOptions += `<optgroup label="${group}">`;
            reasons.forEach(reason => reasonOptions += `<option value="${reason}">${reason}</option>`);
            reasonOptions += `</optgroup>`;
        });
        downtimeReasonSelect.innerHTML = reasonOptions;
    }

    async function handleDowntimeFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const data = Object.fromEntries(new FormData(form).entries());
        const statusMessage = document.getElementById('downtime-status-message');
        if (!data.start_time || !data.end_time) {
            if (statusMessage) { statusMessage.textContent = 'Por favor, preencha a hora de início e fim.'; statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center'; }
            return;
        }
        const submitButton = document.getElementById('downtime-submit-button');
        if (!submitButton) return;
        submitButton.disabled = true;
        submitButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i><span>A Salvar...</span>`;
        lucide.createIcons();
        try {
            await db.collection('downtime_entries').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            if (statusMessage) { statusMessage.textContent = 'Parada registrada com sucesso!'; statusMessage.className = 'text-green-600 text-sm font-semibold h-5 text-center'; }
            form.reset();
            if (downtimeDate) downtimeDate.value = getProductionDateString();
        } catch (error) {
            console.error("Erro ao registrar parada: ", error);
            if (statusMessage) { statusMessage.textContent = 'Erro ao registrar. Tente novamente.'; statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center'; }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i data-lucide="save"></i><span>Salvar Registro de Parada</span>`;
            lucide.createIcons();
            if (statusMessage) setTimeout(() => statusMessage.textContent = '', 3000);
        }
    }

    function listenToDowntimeChanges(date) {
        if (!date) return;
        detachActiveListener();
        showLoadingState('downtime-list', true);
        activeListenerUnsubscribe = db.collection('downtime_entries').where('date', '==', date)
            .onSnapshot(snapshot => {
                const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
                renderDowntimeTable(items);
                showLoadingState('downtime-list', false, items.length === 0);
            }, error => {
                console.error("Erro ao carregar paradas: ", error);
                if(downtimeTableContainer) downtimeTableContainer.innerHTML = `<div class="text-center text-red-600 p-4">Erro ao carregar paradas.</div>`;
                showLoadingState('downtime-list', false, true);
            });
    }

    function renderDowntimeTable(items) {
        if (!downtimeTableContainer) return;
        const tableHTML = `
            <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase">Máquina</th><th class="px-4 py-3 text-left text-xs font-medium uppercase">Início</th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase">Fim</th><th class="px-4 py-3 text-left text-xs font-medium uppercase">Duração (min)</th>
                <th class="px-4 py-3 text-left text-xs font-medium uppercase">Motivo</th><th class="px-4 py-3 text-center text-xs font-medium uppercase">Ação</th>
            </tr></thead><tbody class="divide-y divide-gray-200">
            ${items.map(item => {
                const start = new Date(`${item.date}T${item.startTime}`);
                const end = new Date(`${item.date}T${item.endTime}`);
                const duration = end > start ? Math.round((end - start) / 60000) : 0;
                return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 whitespace-nowrap">${item.machine}</td><td class="px-4 py-3 whitespace-nowrap">${item.startTime}</td>
                    <td class="px-4 py-3 whitespace-nowrap">${item.endTime}</td><td class="px-4 py-3 whitespace-nowrap">${duration} min</td>
                    <td class="px-4 py-3 whitespace-nowrap">${item.reason}</td>
                    <td class="px-4 py-3 text-center"><button data-id="${item.id}" class="delete-downtime-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
                </tr>`;
            }).join('')}</tbody></table>`;
        downtimeTableContainer.innerHTML = tableHTML;
        lucide.createIcons();
        downtimeTableContainer.querySelectorAll('.delete-downtime-btn').forEach(btn => btn.addEventListener('click', (e) => showConfirmModal(e.currentTarget.dataset.id, 'downtime_entries')));
    }

    async function loadResumoData() {
        const date = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
        if (!date) return;
        showLoadingState('resumo', true);
        try {
            const planSnapshot = await db.collection('planning').where('date', '==', date).get();
            const plans = planSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (plans.length === 0) { showLoadingState('resumo', false, true); return; }
            const prodSnapshot = await db.collection('production_entries').where('data', '==', date).get();
            const prods = prodSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const downtimeSnapshot = await db.collection('downtime_entries').where('date', '==', date).get();
            const downtimes = downtimeSnapshot.docs.map(doc => doc.data());
            currentReportData = processResumoData(plans, prods, downtimes);
            switchReportView(reportQuantBtn.classList.contains('active') ? 'quant' : 'effic');
            showLoadingState('resumo', false, false);
        } catch (error) { console.error("Erro ao carregar dados de resumo: ", error); showLoadingState('resumo', false, true); }
    }
    
    function processResumoData(plans, productions, downtimes) {
        return plans.map(plan => {
            const data = { ...plan, T1: {}, T2: {}, T3: {} };
            ['T1', 'T2', 'T3'].forEach(turno => {
                const entries = productions.filter(p => p.planId === plan.id && p.turno === turno);
                const produzido = entries.reduce((sum, item) => sum + item.produzido, 0);
                const machineDowntimes = downtimes.filter(d => d.machine === plan.machine);
                const totalParadas = machineDowntimes.reduce((sum, item) => {
                    const start = new Date(`${item.date}T${item.startTime}`);
                    const end = new Date(`${item.date}T${item.endTime}`);
                    return sum + (end > start ? Math.round((end - start) / 60000) : 0);
                }, 0);
                const refugo_kg = entries.reduce((sum, item) => sum + item.refugo_kg, 0);
                const refugo_pcs = plan.piece_weight > 0 ? Math.round((refugo_kg * 1000) / plan.piece_weight) : 0;
                const ciclo_real = plan[`real_cycle_${turno.toLowerCase()}`] || plan.budgeted_cycle;
                const cav_ativas = plan[`active_cavities_${turno.toLowerCase()}`] || plan.mold_cavities;
                const oee = calculateShiftOEE(produzido, totalParadas / 3, refugo_pcs, ciclo_real, cav_ativas);
                data[turno] = { produzido, paradas: totalParadas, refugo_kg, refugo_pcs, ...oee };
            });
            data.total_produzido = (data.T1.produzido || 0) + (data.T2.produzido || 0) + (data.T3.produzido || 0);
            return data;
        });
    }
    
    function calculateShiftOEE(produzido, tempoParadaMin, refugoPcs, cicloReal, cavAtivas) {
        const tempoProgramado = 480, tempoProduzindo = tempoProgramado - tempoParadaMin;
        const disponibilidade = tempoProgramado > 0 ? (tempoProduzindo / tempoProgramado) : 0;
        const producaoTeorica = cicloReal > 0 && cavAtivas > 0 ? (tempoProduzindo * 60 / cicloReal) * cavAtivas : 0;
        const performance = producaoTeorica > 0 ? (produzido / producaoTeorica) : 0;
        const totalProduzido = produzido + refugoPcs;
        const qualidade = totalProduzido > 0 ? (produzido / totalProduzido) : 0;
        const oee = disponibilidade * performance * qualidade;
        return {
            disponibilidade: isNaN(disponibilidade) ? 0 : disponibilidade,
            performance: isNaN(performance) ? 0 : performance,
            qualidade: isNaN(qualidade) ? 0 : qualidade,
            oee: isNaN(oee) ? 0 : oee
        };
    }

    function switchReportView(view) {
        if (reportQuantBtn) reportQuantBtn.classList.toggle('active', view === 'quant');
        if (reportEfficBtn) reportEfficBtn.classList.toggle('active', view === 'effic');
        if (view === 'quant') renderRelatorioQuantitativo(currentReportData);
        else renderRelatorioEficiencia(currentReportData);
    }
    
    function handleResumoTableClick(e) { const btn = e.target.closest('.delete-resumo-btn'); if (btn) showConfirmModal(btn.dataset.id, 'planning'); }
    
    function renderRelatorioQuantitativo(data) {
        if (!resumoContentContainer) return;
        const date = resumoDateSelector.value;
        const tableHTML = `
            <h3 class="text-lg font-bold mb-4 no-print">Relatório Quantitativo - ${date}</h3>
            <div class="print-header hidden"><h1 class="text-xl font-bold">Hokkaido Synchro - Relatório de Produção</h1><p>Data: ${new Date(date.replace(/-/g, '/')).toLocaleDateString('pt-BR')}</p></div>
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Máquina</th><th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Produto</th>
                        <th colspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase">Turno 1</th><th colspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 2</th>
                        <th colspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 3</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">Qtd. Planejada</th><th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">Total Dia</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">Prod. Faltante</th><th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle no-print">Ação</th>
                    </tr>
                    <tr>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase">Prod.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Refugo (kg)</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Prod.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Refugo (kg)</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Prod.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Refugo (kg)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">${data.map(item => {
                    const faltante = (item.planned_quantity || 0) - item.total_produzido;
                    return `
                    <tr>
                        <td class="px-2 py-2 whitespace-nowrap">${item.machine}</td><td class="px-2 py-2 whitespace-nowrap">${item.product}</td>
                        <td class="px-2 py-2 text-center">${(item.T1.produzido || 0).toLocaleString('pt-BR')}</td><td class="px-2 py-2 text-center">${(item.T1.refugo_kg || 0).toFixed(2)}</td>
                        <td class="px-2 py-2 text-center border-l">${(item.T2.produzido || 0).toLocaleString('pt-BR')}</td><td class="px-2 py-2 text-center">${(item.T2.refugo_kg || 0).toFixed(2)}</td>
                        <td class="px-2 py-2 text-center border-l">${(item.T3.produzido || 0).toLocaleString('pt-BR')}</td><td class="px-2 py-2 text-center">${(item.T3.refugo_kg || 0).toFixed(2)}</td>
                        <td class="px-2 py-2 text-center border-l">${(item.planned_quantity || 0).toLocaleString('pt-BR')}</td>
                        <td class="px-2 py-2 text-center font-bold border-l">${item.total_produzido.toLocaleString('pt-BR')}</td>
                        <td class="px-2 py-2 text-center font-bold border-l ${faltante > 0 ? 'text-status-error' : 'text-status-success'}">${faltante.toLocaleString('pt-BR')}</td>
                        <td class="px-2 py-2 text-center border-l no-print"><button data-id="${item.id}" class="delete-resumo-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
                    </tr>`;
                }).join('')}</tbody></table>`;
        resumoContentContainer.innerHTML = tableHTML;
        lucide.createIcons();
    }

    function renderRelatorioEficiencia(data) {
        if (!resumoContentContainer) return;
        const formatPercent = val => `<span class="${val < 0.7 ? 'text-status-error' : val < 0.85 ? 'text-status-warning' : 'text-status-success'}">${(val * 100).toFixed(1)}%</span>`;
        const date = resumoDateSelector.value;
        const tableHTML = `
             <h3 class="text-lg font-bold mb-4 no-print">Relatório de Eficiência - ${date}</h3>
             <div class="print-header hidden"><h1 class="text-xl font-bold">Hokkaido Synchro - Relatório de Eficiência</h1><p>Data: ${new Date(date.replace(/-/g, '/')).toLocaleDateString('pt-BR')}</p></div>
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Máquina</th><th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Produto</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase">Turno 1</th><th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 2</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 3</th><th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle no-print">Ação</th>
                    </tr>
                    <tr>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">${data.map(item => `
                    <tr>
                        <td class="px-2 py-2 whitespace-nowrap">${item.machine}</td><td class="px-2 py-2 whitespace-nowrap">${item.product}</td>
                        <td class="px-2 py-2 text-center">${formatPercent(item.T1.disponibilidade)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T1.performance)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T1.qualidade)}</td><td class="px-2 py-2 text-center font-bold">${formatPercent(item.T1.oee)}</td>
                        <td class="px-2 py-2 text-center border-l">${formatPercent(item.T2.disponibilidade)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T2.performance)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T2.qualidade)}</td><td class="px-2 py-2 text-center font-bold">${formatPercent(item.T2.oee)}</td>
                        <td class="px-2 py-2 text-center border-l">${formatPercent(item.T3.disponibilidade)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T3.performance)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T3.qualidade)}</td><td class="px-2 py-2 text-center font-bold">${formatPercent(item.T3.oee)}</td>
                        <td class="px-2 py-2 text-center border-l no-print"><button data-id="${item.id}" class="delete-resumo-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
                    </tr>`).join('')}</tbody></table>`;
        resumoContentContainer.innerHTML = tableHTML;
        lucide.createIcons();
    }

    function handlePrintReport() { window.print(); }

    function toggleDashboardChart(view) {
        if (!chartToggleProdBtn || !productionChartContainer || !oeeChartContainer) return;
        chartToggleProdBtn.classList.toggle('active', view === 'prod');
        chartToggleOeeBtn.classList.toggle('active', view === 'oee');
        productionChartContainer.classList.toggle('hidden', view !== 'prod');
        oeeChartContainer.classList.toggle('hidden', view !== 'oee');
    }
    
    async function loadDashboardData() {
        const startDate = startDateSelector.value, endDate = endDateSelector.value;
        if (!startDate || !endDate) { alert('Por favor, selecione as datas de início e fim.'); return; }
        showLoadingState('dashboard', true);
        const dashboardContent = document.getElementById('dashboard-content');
        if (dashboardContent) dashboardContent.style.display = 'none';
        try {
            const prodSnapshot = await db.collection('production_entries').where('data', '>=', startDate).where('data', '<=', endDate).get();
            const productions = prodSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (productions.length === 0) {
                fullDashboardData = { perdas: [] };
                populateMachineFilter([]);
                processAndRenderDashboard(fullDashboardData);
                if (dashboardContent) dashboardContent.style.display = 'block';
                showLoadingState('dashboard', false, false); return;
            }
            const planIds = [...new Set(productions.map(p => p.planId))];
            const plans = {};
            for (let i = 0; i < planIds.length; i += 10) {
                const batchIds = planIds.slice(i, i + 10);
                if (batchIds.length > 0) {
                    const planBatchSnapshot = await db.collection('planning').where(firebase.firestore.FieldPath.documentId(), 'in', batchIds).get();
                    planBatchSnapshot.docs.forEach(doc => { plans[doc.id] = doc.data(); });
                }
            }
            const combinedData = productions.filter(prod => plans[prod.planId]).map(prod => ({ ...prod, ...plans[prod.planId] }));
            fullDashboardData = { perdas: combinedData };
            populateMachineFilter(combinedData);
            if (graphMachineFilter && graphMachineFilter.options.length > 1 && !graphMachineFilter.value) graphMachineFilter.value = graphMachineFilter.options[1].value;
            processAndRenderDashboard(fullDashboardData);
            if (dashboardContent) dashboardContent.style.display = 'block';
            showLoadingState('dashboard', false, false);
        } catch (error) {
            console.error("Erro ao carregar dados do dashboard: ", error);
            showLoadingState('dashboard', false, true);
            const dashboardError = document.getElementById('dashboard-error');
            if (dashboardError) dashboardError.style.display = 'block';
        }
    }

    function processAndRenderDashboard({ perdas }) {
        const mainFilterMachine = machineFilter ? machineFilter.value : 'total';
        const graphFilterMachine = graphMachineFilter ? graphMachineFilter.value : null;
        const filteredForKpis = mainFilterMachine === 'total' ? perdas : perdas.filter(p => p.machine === mainFilterMachine);
        const filteredForGraphs = graphFilterMachine ? perdas.filter(p => p.machine === graphFilterMachine && p.data >= startDateSelector.value && p.data <= endDateSelector.value) : [];
        updateKpiCards(calculateDashboardOEE(filteredForKpis));
        if (graphFilterMachine) {
            renderProductionTimelineChart(filteredForGraphs, graphFilterMachine);
            renderOeeByShiftChart(filteredForGraphs, graphFilterMachine);
        } else {
             if (productionTimelineChartInstance) productionTimelineChartInstance.destroy();
             if (oeeByShiftChartInstance) oeeByShiftChartInstance.destroy();
             const msgDiv = document.getElementById('timeline-chart-message');
             if (msgDiv) msgDiv.style.display = 'flex';
        }
        renderParetoChart(filteredForKpis);
    }
    
    function calculateDashboardOEE(data) {
        if (data.length === 0) return { disponibilidade: 0, performance: 0, qualidade: 0, oee: 0 };
        let totalTempoProgramado = new Set(data.map(d => `${d.machine}-${d.data}`)).size * 3 * 480;
        let totalTempoParada = 0, totalProducaoBoa = 0, totalProducaoTeorica = 0, totalRefugoPcs = 0;
        data.forEach(item => {
            const cicloReal = item[`real_cycle_${item.turno.toLowerCase()}`] || item.budgeted_cycle;
            const cavAtivas = item[`active_cavities_${item.turno.toLowerCase()}`] || item.mold_cavities;
            totalTempoParada += item.duracao_min || 0;
            totalProducaoBoa += item.produzido || 0;
            if (item.piece_weight > 0) totalRefugoPcs += Math.round(((item.refugo_kg || 0) * 1000) / item.piece_weight);
            if (cicloReal > 0 && cavAtivas > 0) totalProducaoTeorica += ((480 - (item.duracao_min || 0)) * 60 / cicloReal) * cavAtivas;
        });
        const tempoProduzindoTotal = totalTempoProgramado - totalTempoParada;
        const disponibilidade = totalTempoProgramado > 0 ? (tempoProduzindoTotal / totalTempoProgramado) : 0;
        const performance = totalProducaoTeorica > 0 ? (totalProducaoBoa / totalProducaoTeorica) : 0;
        const qualidade = (totalProducaoBoa + totalRefugoPcs) > 0 ? (totalProducaoBoa / (totalProducaoBoa + totalRefugoPcs)) : 0;
        const oee = disponibilidade * performance * qualidade;
        return { disponibilidade: isNaN(disponibilidade) ? 0 : disponibilidade, performance: isNaN(performance) ? 0 : performance, qualidade: isNaN(qualidade) ? 0 : qualidade, oee: isNaN(oee) ? 0 : oee };
    }

    function updateKpiCards(kpis) {
        const format = val => (val * 100).toFixed(1) + '%';
        if (document.getElementById('kpi-disponibilidade')) document.getElementById('kpi-disponibilidade').textContent = format(kpis.disponibilidade);
        if (document.getElementById('kpi-performance')) document.getElementById('kpi-performance').textContent = format(kpis.performance);
        if (document.getElementById('kpi-qualidade')) document.getElementById('kpi-qualidade').textContent = format(kpis.qualidade);
        if (document.getElementById('kpi-oee')) document.getElementById('kpi-oee').textContent = format(kpis.oee);
    }

    function renderProductionTimelineChart(data, selectedMachine) {
        const ctx = document.getElementById('productionTimelineChart');
        if (!ctx) return;
        const msgDiv = document.getElementById('timeline-chart-message');
        if (productionTimelineChartInstance) productionTimelineChartInstance.destroy();
        if (!selectedMachine || selectedMachine === 'total') { ctx.style.display = 'none'; if (msgDiv) msgDiv.style.display = 'flex'; return; }
        ctx.style.display = 'block';
        if (msgDiv) msgDiv.style.display = 'none';
        
        // This logic is complex and remains untouched as it is functional
        const hourlyData = {};
        for(let i=7;i<24;i++) hourlyData[`${String(i).padStart(2,'0')}:00`]=0;
        for(let i=0;i<7;i++) hourlyData[`${String(i).padStart(2,'0')}:00`]=0;
        data.forEach(item => {
            const ts=item.timestamp?.toDate(); if(!ts) return;
            const hour=`${String(ts.getHours()).padStart(2,'0')}:00`;
            if(hourlyData[hour]!==undefined) hourlyData[hour]+=item.produzido||0;
        });
        const sortedHours=Object.keys(hourlyData).sort((a,b)=>{const hA=parseInt(a.split(':')[0]),hB=parseInt(b.split(':')[0]);if(hA>=7&&hB<7)return -1;if(hA<7&&hB>=7)return 1;return hA-hB;});
        let cumulativeTotal=0; const cumulativeProductionData=sortedHours.map(hour=>{cumulativeTotal+=hourlyData[hour];return cumulativeTotal;});
        const planItem=data.length>0?data.find(d=>d.planned_quantity>0):null;
        const metaDiaria=planItem?planItem.planned_quantity:0; const metaPorHora=metaDiaria/24;
        let cumulativeTarget=0; const cumulativeTargetData=sortedHours.map(()=> {cumulativeTarget+=metaPorHora;return cumulativeTarget;});
        let displayLabels=sortedHours, displayProdData=cumulativeProductionData, displayTargetData=cumulativeTargetData;
        const viewingToday=(endDateSelector.value===getProductionDateString()&&startDateSelector.value===getProductionDateString());
        if(viewingToday){const currentHour=new Date().getHours();let currentHourIndex=sortedHours.findIndex(h=>parseInt(h.split(':')[0])===currentHour);if(currentHourIndex===-1&&currentHour<7)currentHourIndex=17+currentHour;else if(currentHourIndex===-1)currentHourIndex=23;const sliceIndex=Math.min(currentHourIndex+2,sortedHours.length);displayLabels=sortedHours.slice(0,sliceIndex);displayProdData=cumulativeProductionData.slice(0,sliceIndex);displayTargetData=cumulativeTargetData.slice(0,sliceIndex);}
        productionTimelineChartInstance=new Chart(ctx,{type:'line',data:{labels:displayLabels,datasets:[{label:'Produção Acumulada',data:displayProdData,borderColor:'#0077C2',backgroundColor:'rgba(0, 119, 194, 0.1)',fill:true,tension:0.3},{label:'Meta Acumulada',data:displayTargetData,borderColor:'#DC2626',borderDash:[5,5],fill:false,pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,title:{display:true,text:'Quantidade de Peças'}}},plugins:{legend:{position:'top'},tooltip:{mode:'index',intersect:false}},hover:{mode:'index',intersect:false}}});
    }

    function renderOeeByShiftChart(data, selectedMachine) {
        const ctx = document.getElementById('oeeByShiftChart');
        if (!ctx) return;
        if (oeeByShiftChartInstance) oeeByShiftChartInstance.destroy();
        if (!selectedMachine || selectedMachine === 'total') return;
        const oeeData = { T1: [], T2: [], T3: [] };
        data.forEach(item => {
            const refugoPcs = item.piece_weight > 0 ? ((item.refugo_kg || 0) * 1000) / item.piece_weight : 0;
            const oee = calculateShiftOEE(item.produzido || 0, item.duracao_min || 0, refugoPcs, item[`real_cycle_${item.turno.toLowerCase()}`] || item.budgeted_cycle, item[`active_cavities_${item.turno.toLowerCase()}`] || item.mold_cavities);
            if (oeeData[item.turno]) oeeData[item.turno].push(oee.oee);
        });
        const avgOee = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length) * 100 : 0;
        oeeByShiftChartInstance = new Chart(ctx, { type: 'bar', data: { labels: ['Turno 1', 'Turno 2', 'Turno 3'], datasets: [{ label: 'Eficiência (OEE)', data: [avgOee(oeeData.T1), avgOee(oeeData.T2), avgOee(oeeData.T3)], backgroundColor: ['#4F46E5', '#10B981', '#0077C2'] }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } } }, plugins: { legend: { display: false } } } });
    }

    function renderParetoChart(data) {
        const ctx = document.getElementById('paretoChart');
        if (!ctx) return;
        if (paretoChartInstance) paretoChartInstance.destroy();
        const reasonCounts = data.reduce((acc, item) => {
            if(item.motivo_refugo && (item.refugo_kg || 0) > 0) acc[item.motivo_refugo] = (acc[item.motivo_refugo] || 0) + (item.refugo_kg || 0);
            return acc;
        }, {});
        const sortedReasons = Object.entries(reasonCounts).sort(([, a], [, b]) => b - a);
        const labels = sortedReasons.map(([reason]) => reason);
        const values = sortedReasons.map(([, count]) => count);
        const total = values.reduce((sum, val) => sum + val, 0);
        let cumulative = 0;
        const cumulativePercentage = values.map(val => { cumulative += val; return total > 0 ? (cumulative / total) * 100 : 0; });
        paretoChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [ { label: 'Refugo (kg)', data: values, backgroundColor: 'rgba(220, 38, 38, 0.7)', yAxisID: 'y' }, { label: 'Acumulado %', data: cumulativePercentage, type: 'line', borderColor: '#4F46E5', fill: false, tension: 0.1, yAxisID: 'y1' } ] }, options: { responsive: true, maintainAspectRatio: true, scales: { y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: { display: true, text: 'Kg' }}, y1: { type: 'linear', display: true, position: 'right', min: 0, max: 105, grid: { drawOnChartArea: false }, ticks: { callback: value => value + '%' } } } } });
    }
    
    function populateMachineFilter(data) {
        const machines = [...new Set(data.map(item => item.machine))].sort();
        const mainOptions = '<option value="total">Visão Geral (Total)</option>' + machines.map(m => `<option value="${m}">${m}</option>`).join('');
        const graphOptions = '<option value="">Selecione...</option>' + machines.map(m => `<option value="${m}">${m}</option>`).join('');
        if (machineFilter) machineFilter.innerHTML = mainOptions;
        if (graphMachineFilter) graphMachineFilter.innerHTML = graphOptions;
    }

    init();
});
