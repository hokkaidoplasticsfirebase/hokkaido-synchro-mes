// This file contains the full and correct JavaScript code for the Hokkaido Synchro MES application.
// All functionalities, including the new database with product codes, are implemented here.

document.addEventListener('DOMContentLoaded', function() {
    // Firebase Configuration
    if (typeof firebase === 'undefined' || typeof firebase.firestore === 'undefined') {
        alert("Erro Crítico: A biblioteca da base de dados não conseguiu ser carregada.");
        return;
    }

    const firebaseConfig = {
        apiKey: "AIzaSyB1YrMK07_7QROsCJQqE0MFsmJncfjphmI",
        authDomain: "hokkaido-synchro.firebaseapp.com",
        projectId: "hokkaido-synchro",
        storageBucket: "hokkaido-synchro.firebasestorage.app",
        messagingSenderId: "635645564631",
        appId: "1:635645564631:web:1e19be7957e39d1adc8292"
    };

    let db;
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
    } catch (error) {
        console.error("Erro ao inicializar Firebase: ", error);
        alert("Erro fatal: Não foi possível conectar à base de dados.");
        return;
    }

    // --- Configuration Lists ---
    const machineList = [
        "H-01", "H-02", "H-03", "H-04", "H-05", "H-06", "H-07", "H-08", "H-09", "H-10",
        "H-11", "H-12", "H-13", "H-14", "H-15", "H-16", "H-17", "H-18", "H-19", "H-20",
        "H-26", "H-27", "H-28", "H-29", "H-30", "H-31", "H-32"
    ];

    // Motivos de Refugo (conforme Excel - Grupos P, F, Q)
    const lossReasons = [
        // Grupo P - PROCESSO
        "BOLHA", "CHUPAGEM", "CONTAMINAÇÃO", "DEGRADAÇÃO", "EMPENAMENTO", "FALHA", 
        "FIAPO", "FORA DE COR", "INÍCIO/REÍNICIO", "JUNÇÃO", "MANCHAS", 
        "MEDIDA FORA DO ESPECIFICADO", "MOÍDO", "PEÇAS PERDIDAS", "QUEIMA", "REBARBA",
        
        // Grupo F - FERRAMENTARIA
        "DEFORMAÇÃO", "GALHO PRESO", "MARCA D'ÁGUA", "MARCA EXTRATOR", "RISCOS", "SUJIDADE",
        
        // Grupo Q - QUALIDADE
        "INSPEÇÃO DE LINHA"
    ];

    // Motivos de Parada (conforme Excel - Grupos A-K)
    const downtimeReasons = [
        // Grupo A - FERRAMENTARIA
        "CORRETIVA DE MOLDE", "PREVENTIVA DE MOLDE", "TROCA DE VERSÃO",
        
        // Grupo B - PROCESSO
        "ABERTURA DE CAVIDADE", "AJUSTE DE PROCESSO", "TRY OUT",
        
        // Grupo C - COMPRAS
        "FALTA DE INSUMO PLANEJADA", "FALTA DE INSUMO NÃO PLANEJADA",
        
        // Grupo D - PREPARAÇÃO
        "AGUARDANDO PREPARAÇÃO DE MATERIAL",
        
        // Grupo E - QUALIDADE
        "AGUARDANDO CLIENTE/FORNECEDOR", "LIBERAÇÃO",
        
        // Grupo F - MANUTENÇÃO
        "MANUTENÇÃO CORRETIVA", "MANUTENÇÃO PREVENTIVA",
        
        // Grupo G - PRODUÇÃO
        "FALTA DE OPERADOR", "TROCA DE COR",
        
        // Grupo H - SETUP
        "INSTALAÇÃO DE MOLDE", "RETIRADA DE MOLDE",
        
        // Grupo I - ADMINISTRATIVO
        "FALTA DE ENERGIA",
        
        // Grupo J - PCP
        "SEM PROGRAMAÇÃO",
        
        // Grupo K - COMERCIAL
        "SEM PEDIDO"
    ];

    const preparadores = ['Daniel', 'João', 'Luis', 'Manaus', 'Rafael', 'Stanley', 'Wagner', 'Yohan'].sort();
    
    // Global Variables
    let activeListenerUnsubscribe = null;
    let currentAnalysisView = 'resumo';
    let docIdToDelete = null;
    let collectionToDelete = null;
    let fullDashboardData = { perdas: [] };
    let paretoChartInstance, productionTimelineChartInstance, oeeByShiftChartInstance, oeeTrendChartInstance;
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
    
    // RCA Selectors
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
            "PROCESSO": [
                "BOLHA", "CHUPAGEM", "CONTAMINAÇÃO", "DEGRADAÇÃO", "EMPENAMENTO", "FALHA", 
                "FIAPO", "FORA DE COR", "INÍCIO/REÍNICIO", "JUNÇÃO", "MANCHAS", 
                "MEDIDA FORA DO ESPECIFICADO", "MOÍDO", "PEÇAS PERDIDAS", "QUEIMA", "REBARBA"
            ],
            "FERRAMENTARIA": [
                "DEFORMAÇÃO", "GALHO PRESO", "MARCA D'ÁGUA", "MARCA EXTRATOR", "RISCOS", "SUJIDADE"
            ],
            "QUALIDADE": [
                "INSPEÇÃO DE LINHA"
            ]
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
        
        // Adicionar opções agrupadas
        Object.entries(groupedReasons).forEach(([group, reasons]) => {
            options += `<optgroup label="${group}">`;
            reasons.forEach(reason => {
                options += `<option value="${reason}">${reason}</option>`;
            });
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
                    if (panel.includes('dashboard') || panel.includes('resumo') || panel.includes('list')) {
                        contentEl.style.display = 'block';
                    } else {
                        contentEl.style.display = 'grid';
                    }
                }
            }
        }
    }

    function showConfirmModal(id, collection) {
        docIdToDelete = id;
        collectionToDelete = collection;
        const confirmText = document.getElementById('confirm-modal-text');
        if (confirmText) {
            if (collection === 'downtime_entries') {
                confirmText.textContent = 'Tem a certeza de que deseja excluir este registro de parada? Esta ação não pode ser desfeita.'
            } else {
                confirmText.textContent = 'Tem a certeza de que deseja excluir este item? Todos os lançamentos associados também serão removidos.'
            }
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
        
        const docRef = db.collection(collectionToDelete).doc(docIdToDelete);

        try {
            if (collectionToDelete === 'planning') {
                const prodEntriesSnapshot = await db.collection('production_entries').where('planId', '==', docIdToDelete).get();
                const batch = db.batch();
                prodEntriesSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }

            await docRef.delete();
            
            if (pageTitle && pageTitle.textContent === 'Análise' && currentAnalysisView === 'resumo') {
                loadResumoData();
            }
            if (pageTitle && pageTitle.textContent === 'Parada de Máquina') {
                listenToDowntimeChanges(downtimeListDate.value);
            }

        } catch (error) {
            console.error("Erro ao excluir: ", error);
            alert("Não foi possível excluir o item e/ou seus dados associados.");
        } finally {
            hideConfirmModal();
        }
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
        
        listenToPlanningChanges(getProductionDateString());
        lucide.createIcons();
    }

    function getProductionDateString(date = new Date()) {
        const localDate = new Date(date);
        if (localDate.getHours() < 7) {
            localDate.setDate(localDate.getDate() - 1);
        }
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
        
        // Adicionar listener para código do produto
        const productCodSelect = document.getElementById('planning-product-cod');
        if (productCodSelect) {
            productCodSelect.addEventListener('change', onPlanningProductCodChange);
        }
        
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
    }

    // --- GESTÃO DE LISTENERS ---
    function detachActiveListener() {
        if (activeListenerUnsubscribe) {
            if (typeof activeListenerUnsubscribe === 'function') {
                activeListenerUnsubscribe();
            } else if (typeof activeListenerUnsubscribe === 'object') {
                Object.values(activeListenerUnsubscribe).forEach(unsub => {
                    if (typeof unsub === 'function') unsub();
                });
            }
            activeListenerUnsubscribe = null;
        }
    }

    // --- NAVEGAÇÃO ---
    function handleNavClick(e) {
        e.preventDefault();
        const page = e.currentTarget.dataset.page;
        
        navButtons.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        pageContents.forEach(content => {
            content.classList.toggle('hidden', content.id !== `${page}-page`);
        });
        
        if (pageTitle) {
            pageTitle.textContent = e.currentTarget.querySelector('span').textContent;
        }
        
        detachActiveListener();

        if (page === 'lancamento') listenToCurrentProductionPlan();
        if (page === 'planejamento') listenToPlanningChanges(getProductionDateString());
        if (page === 'melhoria') listenToRcaData();
        if (page === 'parada') {
            listenToDowntimeChanges(downtimeListDate.value);
            updateDowntimeMachineList(downtimeDate.value);
        }
        if (page === 'analise') loadAnalysisData();

        if (window.innerWidth < 768) {
            closeSidebar();
        }
    }
    
    function openSidebar() {
        if (sidebar && sidebarOverlay) {
            sidebar.classList.remove('-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
        }
    }

    function closeSidebar() {
        if (sidebar && sidebarOverlay) {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('hidden');
        }
    }

    function handleAnalysisTabClick(e) {
        const view = e.currentTarget.dataset.view;
        currentAnalysisView = view;
        
        analysisTabButtons.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        analysisViews.forEach(v => {
            v.classList.toggle('hidden', v.id !== `${view}-view`);
        });
        
        loadAnalysisData();
    }

    function loadAnalysisData() {
        if (currentAnalysisView === 'resumo') {
            loadResumoData();
        } else {
            loadDashboardData();
        }
    }

    function setDateRange(range) {
        const end = new Date();
        const start = new Date();
        
        switch(range) {
            case '7':
                start.setDate(start.getDate() - 7);
                break;
            case '30':
                start.setDate(start.getDate() - 30);
                break;
            case 'month':
                start.setDate(1);
                break;
            default:
                start.setDate(start.getDate() - 7);
        }
        
        if (startDateSelector) startDateSelector.value = start.toISOString().split('T')[0];
        if (endDateSelector) endDateSelector.value = end.toISOString().split('T')[0];
    }
    
    // --- ABA DE PLANEJAMENTO ---
    function setupPlanningTab() {
        if (!planningMachineSelect) return;
        
        const machineOptions = machineList.map(m => `<option value="${m}">${m}</option>`).join('');
        planningMachineSelect.innerHTML = `<option value="">Selecione...</option>${machineOptions}`;

        // Configurar select de código do produto
        const productCodSelect = document.getElementById('planning-product-cod');
        if (productCodSelect) {
            // Ordenar produtos por código
            const sortedProducts = [...productDatabase].sort((a, b) => a.cod - b.cod);
            const productOptions = sortedProducts.map(p => 
                `<option value="${p.cod}" data-client="${p.client}" data-name="${p.name}" data-cycle="${p.cycle}" data-cavities="${p.cavities}" data-weight="${p.weight}">
                    ${p.cod} - ${p.name} (${p.client})
                </option>`
            ).join('');
            productCodSelect.innerHTML = `<option value="">Selecione...</option>${productOptions}`;
        }
    }

    function onPlanningProductCodChange(e) {
        const productCod = e.target.value;
        const selectedOption = e.target.selectedOptions[0];
        
        const cycleInput = document.getElementById('budgeted-cycle');
        const cavitiesInput = document.getElementById('mold-cavities');
        const weightInput = document.getElementById('piece-weight');
        const plannedQtyInput = document.getElementById('planned-quantity');
        const productNameDisplay = document.getElementById('product-name-display');

        if (productCod && selectedOption) {
            const client = selectedOption.dataset.client;
            const name = selectedOption.dataset.name;
            const cycle = parseFloat(selectedOption.dataset.cycle) || 0;
            const cavities = parseInt(selectedOption.dataset.cavities) || 0;
            const weight = parseFloat(selectedOption.dataset.weight) || 0;

            if (cycleInput) cycleInput.value = cycle;
            if (cavitiesInput) cavitiesInput.value = cavities;
            if (weightInput) weightInput.value = weight;
            
            // Calcular quantidade planejada (85% de eficiência)
            const plannedQty = Math.floor((86400 / cycle) * cavities * 0.85);
            if (plannedQtyInput) plannedQtyInput.value = plannedQty;
            
            // Mostrar nome do produto selecionado
            if (productNameDisplay) {
                productNameDisplay.textContent = `${name} (${client})`;
                productNameDisplay.style.display = 'block';
            }
        } else {
            if (cycleInput) cycleInput.value = '';
            if (cavitiesInput) cavitiesInput.value = '';
            if (weightInput) weightInput.value = '';
            if (plannedQtyInput) plannedQtyInput.value = '';
            if (productNameDisplay) {
                productNameDisplay.textContent = '';
                productNameDisplay.style.display = 'none';
            }
        }
    }

    async function handlePlanningFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Buscar dados completos do produto selecionado
        const productCod = data.product_cod;
        const product = productDatabase.find(p => p.cod == productCod);
        
        if (!product) {
            alert('Produto não encontrado!');
            return;
        }

        const statusMessage = document.getElementById('planning-status-message');
        const submitButton = document.getElementById('planning-submit-button');
        
        if (!submitButton) return;
        
        submitButton.disabled = true;
        submitButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i><span>A Adicionar...</span>`;
        lucide.createIcons();
        
        try {
            const docData = {
                date: data.date,
                machine: data.machine,
                product_cod: product.cod,
                client: product.client,
                product: product.name,
                budgeted_cycle: product.cycle,
                mold_cavities: product.cavities,
                piece_weight: parseFloat(data.piece_weight) || product.weight,
                planned_quantity: parseInt(data.planned_quantity),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('planning').add(docData);
            
            if (statusMessage) {
                statusMessage.textContent = 'Item adicionado com sucesso!';
                statusMessage.className = 'text-status-success text-sm font-semibold h-5 text-center';
            }
            form.reset();
            document.getElementById('budgeted-cycle').value = '';
            document.getElementById('mold-cavities').value = '';
            document.getElementById('piece-weight').value = '';
            document.getElementById('planned-quantity').value = '';
            const productNameDisplay = document.getElementById('product-name-display');
            if (productNameDisplay) {
                productNameDisplay.textContent = '';
                productNameDisplay.style.display = 'none';
            }
        } catch (error) {
            console.error("Erro ao adicionar planejamento: ", error);
            if (statusMessage) {
                statusMessage.textContent = 'Erro ao adicionar. Tente novamente.';
                statusMessage.className = 'text-status-error text-sm font-semibold h-5 text-center';
            }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i data-lucide="plus-circle"></i><span>Adicionar ao Plano</span>`;
            lucide.createIcons();
            if (statusMessage) {
                setTimeout(() => statusMessage.textContent = '', 3000);
            }
        }
    }

    function listenToPlanningChanges(date) {
        if (!date) return;
        
        detachActiveListener();
        showLoadingState('leader-panel', true);
        
        let planningItems = [];
        let productionEntries = [];

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

        const planningListener = db.collection('planning').where('date', '==', date)
            .onSnapshot(snapshot => {
                planningItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                planningItems.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
                render();
            }, error => {
                console.error("Erro ao carregar planejamentos:", error);
                if(leaderLaunchPanel) leaderLaunchPanel.innerHTML = `<div class="col-span-full text-center text-red-600">Erro ao carregar dados.</div>`;
                showLoadingState('leader-panel', false, true);
            });

        const entriesListener = db.collection('production_entries').where('data', '==', date)
            .onSnapshot(snapshot => {
                productionEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                render();
            }, error => console.error("Erro ao carregar lançamentos de produção:", error));

        activeListenerUnsubscribe = { planningListener, entriesListener };
    }

    function renderPlanningTable(items) {
        if (!planningTableBody) return;
        const orDash = (value) => value || '-';
        const orDashNum = (value) => value ? value.toLocaleString('pt-BR') : '-';
        const cycleClass = (realCycle, budgetedCycle) => {
            if (!realCycle || !budgetedCycle) return '';
            return realCycle > budgetedCycle ? 'text-status-error font-bold' : '';
        };

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
                <td class="px-2 py-2 whitespace-nowrap border no-print">
                    <button data-id="${item.id}" class="delete-plan-btn text-status-error hover:text-red-700 p-1 mx-auto flex"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    }

    function handlePlanningTableClick(e) {
        const deleteButton = e.target.closest('.delete-plan-btn');
        if (deleteButton) {
            const docId = deleteButton.dataset.id;
            showConfirmModal(docId, 'planning');
        }
    }
    
    // --- PAINEL DO LÍDER ---
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
            
            const btnClasses = turnos.map(turno => {
                 const isComplete = item[`real_cycle_${turno.toLowerCase()}`] && item[`active_cavities_${turno.toLowerCase()}`];
                 return isComplete ? 'bg-status-success hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600';
            });

            return `
                <div class="border rounded-lg p-4 shadow-md flex flex-col justify-between bg-white">
                    <div>
                        <h3 class="font-bold text-lg">${item.machine}</h3>
                        <p class="text-sm text-gray-600">${item.product}</p>
                        <div class="grid grid-cols-3 gap-2 mt-2">
                           ${statusHtml}
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-4">
                        <button data-id="${item.id}" data-turno="T1" class="setup-btn ${btnClasses[0]} text-white font-bold py-2 px-3 rounded-lg text-sm">Setup T1</button>
                        <button data-id="${item.id}" data-turno="T2" class="setup-btn ${btnClasses[1]} text-white font-bold py-2 px-3 rounded-lg text-sm">Setup T2</button>
                        <button data-id="${item.id}" data-turno="T3" class="setup-btn ${btnClasses[2]} text-white font-bold py-2 px-3 rounded-lg text-sm">Setup T3</button>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    }
    
    function handleLeaderPanelClick(e) {
        const setupButton = e.target.closest('.setup-btn');
        if (setupButton) {
            const docId = setupButton.dataset.id;
            const turno = setupButton.dataset.turno;
            showLeaderModal(docId, turno);
        }
    }

    async function showLeaderModal(docId, turno) {
        if (!leaderModalForm || !leaderModalTitle) return;
        
        leaderModalForm.querySelector('#leader-modal-cancel-btn')?.remove();
        
        leaderModalForm.innerHTML = `
            <input type="hidden" id="leader-entry-doc-id" name="docId">
            <input type="hidden" id="leader-entry-turno" name="turno">
            <div>
                <label for="leader-entry-real-cycle" class="block text-sm font-medium">Ciclo Real (${turno})</label>
                <input type="number" id="leader-entry-real-cycle" name="real_cycle" step="0.1" class="mt-1 w-full p-2 border-gray-300 rounded-md">
            </div>
            <div>
                <label for="leader-entry-active-cavities" class="block text-sm font-medium">Cavidades Ativas (${turno})</label>
                <input type="number" id="leader-entry-active-cavities" name="active_cavities" step="1" class="mt-1 w-full p-2 border-gray-300 rounded-md">
            </div>
            <div>
                <label for="leader-entry-produzido" class="block text-sm font-medium">Produção Boa (peças)</label>
                <input type="number" id="leader-entry-produzido" name="produzido" min="0" class="mt-1 w-full p-2 border-gray-300 rounded-md">
            </div>
            <div class="mt-6 flex justify-end gap-3 pt-4 border-t">
                <button type="button" id="leader-modal-cancel-btn" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-6 rounded-lg">Cancelar</button>
                <button type="submit" class="bg-primary-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-lg">Salvar</button>
            </div>`;
        
        leaderModal.querySelector('#leader-modal-cancel-btn').addEventListener('click', hideLeaderModal);
        
        document.getElementById('leader-entry-doc-id').value = docId;
        document.getElementById('leader-entry-turno').value = turno;

        try {
            const docRef = db.collection('planning').doc(docId);
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                leaderModalTitle.textContent = `Lançamento: ${data.machine} - ${turno}`;
                
                document.getElementById('leader-entry-real-cycle').value = data[`real_cycle_${turno.toLowerCase()}`] || '';
                document.getElementById('leader-entry-active-cavities').value = data[`active_cavities_${turno.toLowerCase()}`] || '';
            }
            
            const entriesRef = db.collection('production_entries');
            const q = entriesRef.where('planId', '==', docId).where('turno', '==', turno).limit(1);
            const querySnapshot = await q.get();

            if (!querySnapshot.empty) {
                const prodEntry = querySnapshot.docs[0].data();
                document.getElementById('leader-entry-produzido').value = prodEntry.produzido || '';
            }

        } catch (error) {
            console.error("Erro ao buscar dados do setup: ", error);
        }
        
        leaderModal.classList.remove('hidden');
    }
    
    function hideLeaderModal() {
        if (leaderModal) leaderModal.classList.add('hidden');
    }

    async function handleLeaderEntrySubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const docId = formData.get('docId');
        const turno = formData.get('turno');
        const realCycle = parseFloat(formData.get('real_cycle')) || null;
        const activeCavities = parseInt(formData.get('active_cavities')) || null;
        const produzido = parseInt(formData.get('produzido')) || 0;

        const planDataToUpdate = {
            [`real_cycle_${turno.toLowerCase()}`]: realCycle,
            [`active_cavities_${turno.toLowerCase()}`]: activeCavities,
        };

        try {
            await db.collection('planning').doc(docId).update(planDataToUpdate);

            const entriesRef = db.collection('production_entries');
            const q = entriesRef.where('planId', '==', docId).where('turno', '==', turno).limit(1);
            const querySnapshot = await q.get();

            if (querySnapshot.empty) {
                const planDoc = await db.collection('planning').doc(docId).get();
                const planData = planDoc.data();
                
                await entriesRef.add({
                    planId: docId,
                    turno: turno,
                    produzido: produzido,
                    data: planData.date,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    duracao_min: 0, refugo_kg: 0, borras_kg: 0, motivo_refugo: "",
                });
            } else {
                const entryDoc = querySnapshot.docs[0];
                await entryDoc.ref.update({ produzido: produzido });
            }

            hideLeaderModal();
        } catch (error) {
            console.error("Erro ao salvar dados do líder: ", error);
            alert("Não foi possível salvar os dados. Tente novamente.");
        }
    }

    // --- PAINEL DO OPERADOR ---
    function listenToCurrentProductionPlan() {
        detachActiveListener();
        const date = getProductionDateString();
        showLoadingState('launch-panel', true);

        let planningItems = [];
        let launchedEntries = new Set();
        let productionEntries = [];

        const render = () => {
            renderLaunchPanel(planningItems, launchedEntries, productionEntries);
            showLoadingState('launch-panel', false, planningItems.length === 0);
        };

        const planningListener = db.collection('planning')
            .where('date', '==', date)
            .onSnapshot(snapshot => {
                planningItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                planningItems.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
                render();
            }, error => {
                 console.error("Erro ao carregar plano de produção: ", error);
                 if (launchPanelContainer) {
                    launchPanelContainer.innerHTML = `<div class="col-span-full text-center text-red-600 bg-red-50 p-4 rounded-lg"><p class="font-bold">Falha ao carregar dados.</p></div>`;
                 }
            });
        
        const entriesListener = db.collection('production_entries')
            .where('data', '==', date)
            .onSnapshot(snapshot => {
                launchedEntries = new Set();
                productionEntries = snapshot.docs.map(doc => doc.data());
                snapshot.forEach(doc => {
                    const entry = doc.data();
                    if(entry.produzido > 0 || entry.refugo_kg > 0) {
                        launchedEntries.add(`${entry.planId}-${entry.turno}`);
                    }
                });
                render();
            }, error => {
                console.error("Erro ao carregar lançamentos de produção: ", error);
            });

        activeListenerUnsubscribe = { planningListener, entriesListener };
    }

    function renderLaunchPanel(planItems, launchedEntries, productionEntries) {
        if (!launchPanelContainer) return;
        launchPanelContainer.innerHTML = planItems.map(item => {
            const t1Launched = launchedEntries.has(`${item.id}-T1`);
            const t2Launched = launchedEntries.has(`${item.id}-T2`);
            const t3Launched = launchedEntries.has(`${item.id}-T3`);

            const t1Class = t1Launched ? 'bg-status-success hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600';
            const t2Class = t2Launched ? 'bg-status-success hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600';
            const t3Class = t3Launched ? 'bg-status-success hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600';
            
            const totalProduzido = productionEntries
                .filter(p => p.planId === item.id)
                .reduce((sum, p) => sum + (p.produzido || 0), 0);
            
            const meta = item.planned_quantity || 0;
            const progresso = meta > 0 ? (totalProduzido / meta) * 100 : 0;
            const progressoCor = progresso < 50 ? 'bg-status-error' : progresso < 90 ? 'bg-status-warning' : 'bg-status-success';

            return `
            <div class="bg-gray-50 border rounded-lg p-4 shadow-sm flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-lg">${item.machine}</h3>
                            <p class="text-sm text-gray-600">${item.product}</p>
                        </div>
                        <span class="text-xs font-bold text-gray-500">${totalProduzido.toLocaleString('pt-BR')} / ${meta.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div class="${progressoCor} h-2.5 rounded-full" style="width: ${Math.min(progresso, 100)}%"></div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 mt-4">
                    <button data-id="${item.id}" data-turno="T1" class="launch-btn ${t1Class} text-white font-bold py-2 rounded-md">Turno 1</button>
                    <button data-id="${item.id}" data-turno="T2" class="launch-btn ${t2Class} text-white font-bold py-2 rounded-md">Turno 2</button>
                    <button data-id="${item.id}" data-turno="T3" class="launch-btn ${t3Class} text-white font-bold py-2 rounded-md">Turno 3</button>
                </div>
            </div>
        `}).join('');
        lucide.createIcons();
    }
    
    async function handleLaunchPanelClick(e) {
        const launchButton = e.target.closest('.launch-btn');
        if (launchButton) {
            const planId = launchButton.dataset.id;
            const turno = launchButton.dataset.turno;
            showProductionModal(planId, turno);
        }
    }

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
            } else { throw new Error("Plano não encontrado."); }
            
            const entriesRef = db.collection('production_entries');
            const q = entriesRef.where('planId', '==', planId).where('turno', '==', turno).limit(1);
            const querySnapshot = await q.get();

            if (!querySnapshot.empty) {
                const prodEntry = querySnapshot.docs[0].data();
                document.getElementById('production-entry-produzido').value = prodEntry.produzido || 0;
                document.getElementById('production-entry-refugo').value = prodEntry.refugo_kg || 0;
                document.getElementById('production-entry-borras').value = prodEntry.borras_kg || 0;
                document.getElementById('production-entry-perdas').value = prodEntry.motivo_refugo || '';
            }
            
            productionModal.classList.remove('hidden');

        } catch(error) {
            console.error("Erro ao abrir modal de produção:", error);
            alert("Não foi possível carregar os dados. Tente novamente.");
        }
    }

    function hideProductionModal() {
        if (productionModal) productionModal.classList.add('hidden');
    }

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
            produzido: parseInt(formData.get('produzido')) || 0,
            duracao_min: 0,
            refugo_kg: parseFloat(formData.get('refugo')) || 0,
            borras_kg: parseFloat(formData.get('borras')) || 0,
            motivo_refugo: formData.get('perdas'),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const entriesRef = db.collection('production_entries');
            const q = entriesRef.where('planId', '==', planId).where('turno', '==', turno).limit(1);
            const querySnapshot = await q.get();
            
            if(querySnapshot.empty){
                const planDoc = await db.collection('planning').doc(planId).get();
                const planData = planDoc.data();
                await entriesRef.add({ ...data, planId, turno, data: planData.date });
            } else {
                await querySnapshot.docs[0].ref.update(data);
            }

            if (statusMessage) {
                statusMessage.textContent = 'Lançamento salvo com sucesso!';
                statusMessage.className = 'text-green-600 text-sm font-semibold h-5 text-center';
            }
            setTimeout(() => {
                hideProductionModal();
                if (statusMessage) statusMessage.textContent = '';
            }, 1500);
        } catch (error) {
            console.error("Erro ao salvar lançamento: ", error);
            if (statusMessage) {
                statusMessage.textContent = 'Erro ao salvar. Tente novamente.';
                statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center';
            }
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Salvar Lançamento';
        }
    }
    
    // --- ABA DE MELHORIA CONTÍNUA ---
    async function handleRcaFormSubmit(e) {
        e.preventDefault();
        // Implementação básica - expandir conforme necessário
        alert('Funcionalidade de Melhoria Contínua será implementada em breve.');
    }

    function listenToRcaData() {
        // Implementação futura
    }
    
    // --- ABA DE PARADA DE MÁQUINA ---
    async function updateDowntimeMachineList(date) {
        if (!downtimeMachineSelect || !date) {
            if (downtimeMachineSelect) downtimeMachineSelect.innerHTML = '<option value="">Selecione uma data</option>';
            return;
        }

        try {
            const planningSnapshot = await db.collection('planning').where('date', '==', date).get();
            const plannedMachines = new Set();
            planningSnapshot.forEach(doc => {
                plannedMachines.add(doc.data().machine);
            });
            
            const sortedMachines = [...plannedMachines].sort();

            if (sortedMachines.length > 0) {
                const machineOptions = sortedMachines.map(m => `<option value="${m}">${m}</option>`).join('');
                downtimeMachineSelect.innerHTML = `<option value="">Selecione...</option>${machineOptions}`;
            } else {
                downtimeMachineSelect.innerHTML = '<option value="">Nenhuma máquina planejada</option>';
            }

        } catch (error) {
            console.error("Erro ao carregar máquinas planejadas: ", error);
            downtimeMachineSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }

    function setupDowntimeTab(){
        if (!downtimeReasonSelect) return;
        
        const groupedReasons = getGroupedDowntimeReasons();
        let reasonOptions = '<option value="">Selecione...</option>';
        
        // Adicionar opções agrupadas
        Object.entries(groupedReasons).forEach(([group, reasons]) => {
            reasonOptions += `<optgroup label="${group}">`;
            reasons.forEach(reason => {
                reasonOptions += `<option value="${reason}">${reason}</option>`;
            });
            reasonOptions += `</optgroup>`;
        });
        
        downtimeReasonSelect.innerHTML = reasonOptions;
    }

    async function handleDowntimeFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const statusMessage = document.getElementById('downtime-status-message');
        const submitButton = document.getElementById('downtime-submit-button');

        if (!data.start_time || !data.end_time) {
            if (statusMessage) {
                statusMessage.textContent = 'Por favor, preencha a hora de início e fim.';
                statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center';
            }
            return;
        }

        if (!submitButton) return;
        
        submitButton.disabled = true;
        submitButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i><span>A Salvar...</span>`;
        lucide.createIcons();

        try {
            const docData = {
                date: data.date,
                machine: data.machine,
                startTime: data.start_time,
                endTime: data.end_time,
                reason: data.reason,
                observations: data.observations,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('downtime_entries').add(docData);
            
            if (statusMessage) {
                statusMessage.textContent = 'Parada registrada com sucesso!';
                statusMessage.className = 'text-green-600 text-sm font-semibold h-5 text-center';
            }
            form.reset();
            if (downtimeDate) downtimeDate.value = getProductionDateString();
        } catch (error) {
            console.error("Erro ao registrar parada: ", error);
            if (statusMessage) {
                statusMessage.textContent = 'Erro ao registrar. Tente novamente.';
                statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center';
            }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i data-lucide="save"></i><span>Salvar Registro de Parada</span>`;
            lucide.createIcons();
            if (statusMessage) {
                setTimeout(() => statusMessage.textContent = '', 3000);
            }
        }
    }

    function listenToDowntimeChanges(date) {
        if (!date) return;
        
        detachActiveListener();
        showLoadingState('downtime-list', true);

        activeListenerUnsubscribe = db.collection('downtime_entries').where('date', '==', date)
            .onSnapshot(snapshot => {
                let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                items.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
                renderDowntimeTable(items);
                showLoadingState('downtime-list', false, items.length === 0);
            }, error => {
                console.error("Erro ao carregar paradas: ", error);
                if(downtimeTableContainer){
                    downtimeTableContainer.innerHTML = `<div class="text-center text-red-600 p-4">Erro ao carregar paradas. Verifique a consola para mais detalhes.</div>`;
                }
                showLoadingState('downtime-list', false, true);
            });
    }

    function renderDowntimeTable(items) {
        if (!downtimeTableContainer) return;
        
        const tableHTML = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium uppercase">Máquina</th>
                        <th class="px-4 py-3 text-left text-xs font-medium uppercase">Início</th>
                        <th class="px-4 py-3 text-left text-xs font-medium uppercase">Fim</th>
                        <th class="px-4 py-3 text-left text-xs font-medium uppercase">Duração (min)</th>
                        <th class="px-4 py-3 text-left text-xs font-medium uppercase">Motivo</th>
                        <th class="px-4 py-3 text-center text-xs font-medium uppercase">Ação</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${items.map(item => {
                        const start = new Date(`${item.date}T${item.startTime}`);
                        const end = new Date(`${item.date}T${item.endTime}`);
                        const duration = end > start ? Math.round((end - start) / 60000) : 0;
                        return `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-3 whitespace-nowrap">${item.machine}</td>
                                <td class="px-4 py-3 whitespace-nowrap">${item.startTime}</td>
                                <td class="px-4 py-3 whitespace-nowrap">${item.endTime}</td>
                                <td class="px-4 py-3 whitespace-nowrap">${duration} min</td>
                                <td class="px-4 py-3 whitespace-nowrap">${item.reason}</td>
                                <td class="px-4 py-3 text-center">
                                    <button data-id="${item.id}" class="delete-downtime-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        downtimeTableContainer.innerHTML = tableHTML;
        lucide.createIcons();

        downtimeTableContainer.querySelectorAll('.delete-downtime-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.dataset.id;
                showConfirmModal(docId, 'downtime_entries');
            });
        });
    }

    // --- ABA DE ANÁLISE: RESUMO ---
    async function loadResumoData() {
        const date = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
        if (!date) return;

        showLoadingState('resumo', true);

        try {
            const planSnapshot = await db.collection('planning').where('date', '==', date).get();
            const plans = planSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (plans.length === 0) {
                showLoadingState('resumo', false, true);
                return;
            }
            
            const productionSnapshot = await db.collection('production_entries').where('data', '==', date).get();
            const productions = productionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const downtimeSnapshot = await db.collection('downtime_entries').where('date', '==', date).get();
            const downtimes = downtimeSnapshot.docs.map(doc => doc.data());

            currentReportData = processResumoData(plans, productions, downtimes);
            
            const currentView = reportQuantBtn && reportQuantBtn.classList.contains('active') ? 'quant' : 'effic';
            switchReportView(currentView);

            showLoadingState('resumo', false, false);

        } catch (error) {
            console.error("Erro ao carregar dados de resumo: ", error);
            showLoadingState('resumo', false, true);
        }
    }
    
    function processResumoData(plans, productions, downtimes) {
        return plans.map(plan => {
            const data = { ...plan, T1: {}, T2: {}, T3: {} };
            const turnos = ['T1', 'T2', 'T3'];

            turnos.forEach(turno => {
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
        const tempoTurnoMin = 480;
        
        const tempoProgramado = tempoTurnoMin;
        const tempoProduzindo = tempoProgramado - tempoParadaMin;
        const disponibilidade = tempoProgramado > 0 ? (tempoProduzindo / tempoProgramado) : 0;

        const producaoTeorica = cicloReal > 0 && cavAtivas > 0 ? (tempoProduzindo * 60 / cicloReal) * cavAtivas : 0;
        const performance = producaoTeorica > 0 ? (produzido / producaoTeorica) : 0;
        
        const totalProduzido = produzido + refugoPcs;
        const qualidade = totalProduzido > 0 ? (produzido / totalProduzido) : 0;
        
        const oee = disponibilidade * performance * qualidade;
        
        return {
            disponibilidade: isNaN(disponibilidade) || !isFinite(disponibilidade) ? 0 : disponibilidade,
            performance: isNaN(performance) || !isFinite(performance) ? 0 : performance,
            qualidade: isNaN(qualidade) || !isFinite(qualidade) ? 0 : qualidade,
            oee: isNaN(oee) || !isFinite(oee) ? 0 : oee
        };
    }

    function switchReportView(view) {
        if (reportQuantBtn && reportEfficBtn) {
            reportQuantBtn.classList.toggle('active', view === 'quant');
            reportEfficBtn.classList.toggle('active', view === 'effic');
        }
        if (view === 'quant') {
            renderRelatorioQuantitativo(currentReportData);
        } else {
            renderRelatorioEficiencia(currentReportData);
        }
    }
    
    function handleResumoTableClick(e) {
        const deleteButton = e.target.closest('.delete-resumo-btn');
        if (deleteButton) {
            const docId = deleteButton.dataset.id;
            showConfirmModal(docId, 'planning');
        }
    }
    
    function renderRelatorioQuantitativo(data) {
        if (!resumoContentContainer) return;
        
        const date = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
        const tableHTML = `
            <h3 class="text-lg font-bold mb-4 no-print">Relatório Quantitativo - ${date}</h3>
            <div class="print-header hidden">
                <h1 class="text-xl font-bold">Hokkaido Synchro - Relatório de Produção</h1>
                <p>Data: ${new Date(date.replace(/-/g, '/')).toLocaleDateString('pt-BR')}</p>
            </div>
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Máquina</th>
                        <th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Produto</th>
                        <th colspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase">Turno 1</th>
                        <th colspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 2</th>
                        <th colspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 3</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">Qtd. Planejada</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">Total Dia</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">Prod. Faltante</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle no-print">Ação</th>
                    </tr>
                    <tr>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase">Prod.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Refugo (kg)</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Prod.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Refugo (kg)</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Prod.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Refugo (kg)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${data.map(item => {
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
                            <td class="px-2 py-2 text-center border-l no-print">
                                <button data-id="${item.id}" class="delete-resumo-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>`;
        resumoContentContainer.innerHTML = tableHTML;
        lucide.createIcons();
    }

    function renderRelatorioEficiencia(data) {
        if (!resumoContentContainer) return;
        
        const formatPercent = (val) => `<span class="${val < 0.7 ? 'text-status-error' : val < 0.85 ? 'text-status-warning' : 'text-status-success'}">${(val * 100).toFixed(1)}%</span>`;
        const date = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
        const tableHTML = `
             <h3 class="text-lg font-bold mb-4 no-print">Relatório de Eficiência - ${date}</h3>
             <div class="print-header hidden">
                <h1 class="text-xl font-bold">Hokkaido Synchro - Relatório de Eficiência</h1>
                <p>Data: ${new Date(date.replace(/-/g, '/')).toLocaleDateString('pt-BR')}</p>
            </div>
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Máquina</th><th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Produto</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase">Turno 1</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 2</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 3</th>
                         <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle no-print">Ação</th>
                    </tr>
                    <tr>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${data.map(item => `
                        <tr>
                            <td class="px-2 py-2 whitespace-nowrap">${item.machine}</td><td class="px-2 py-2 whitespace-nowrap">${item.product}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T1.disponibilidade)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T1.performance)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T1.qualidade)}</td><td class="px-2 py-2 text-center font-bold">${formatPercent(item.T1.oee)}</td>
                            <td class="px-2 py-2 text-center border-l">${formatPercent(item.T2.disponibilidade)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T2.performance)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T2.qualidade)}</td><td class="px-2 py-2 text-center font-bold">${formatPercent(item.T2.oee)}</td>
                            <td class="px-2 py-2 text-center border-l">${formatPercent(item.T3.disponibilidade)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T3.performance)}</td><td class="px-2 py-2 text-center">${formatPercent(item.T3.qualidade)}</td><td class="px-2 py-2 text-center font-bold">${formatPercent(item.T3.oee)}</td>
                            <td class="px-2 py-2 text-center border-l no-print">
                                <button data-id="${item.id}" class="delete-resumo-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        resumoContentContainer.innerHTML = tableHTML;
        lucide.createIcons();
    }

    function handlePrintReport() {
        window.print();
    }

    // --- ABA DE ANÁLISE: DASHBOARD ---
    
    function toggleDashboardChart(view) {
        if (!chartToggleProdBtn || !chartToggleOeeBtn || !productionChartContainer || !oeeChartContainer) return;
        
        chartToggleProdBtn.classList.toggle('active', view === 'prod');
        chartToggleOeeBtn.classList.toggle('active', view === 'oee');
        productionChartContainer.classList.toggle('hidden', view !== 'prod');
        oeeChartContainer.classList.toggle('hidden', view !== 'oee');
    }
    
    async function loadDashboardData() {
        const startDate = startDateSelector ? startDateSelector.value : getProductionDateString();
        const endDate = endDateSelector ? endDateSelector.value : getProductionDateString();

        if (!startDate || !endDate) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }
        
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
                showLoadingState('dashboard', false, false);
                return;
            }

            const planIds = [...new Set(productions.map(p => p.planId))];
            const plans = {};
            
            for (let i = 0; i < planIds.length; i += 10) {
                const batchIds = planIds.slice(i, i + 10);
                if (batchIds.length > 0) {
                    const planBatchSnapshot = await db.collection('planning').where(firebase.firestore.FieldPath.documentId(), 'in', batchIds).get();
                    planBatchSnapshot.docs.forEach(doc => {
                        plans[doc.id] = doc.data();
                    });
                }
            }
            
            const combinedData = productions.filter(prod => plans[prod.planId]).map(prod => ({ ...prod, ...plans[prod.planId] }));

            fullDashboardData = { perdas: combinedData };
            
            populateMachineFilter(combinedData);
            if (graphMachineFilter && graphMachineFilter.options.length > 1 && !graphMachineFilter.value) {
                 graphMachineFilter.value = graphMachineFilter.options[1].value;
            }
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

        const filteredDataForKpis = mainFilterMachine === 'total' ? perdas : perdas.filter(p => p.machine === mainFilterMachine);
        const filteredDataForGraphs = graphFilterMachine ? perdas.filter(p => p.machine === graphFilterMachine && p.data >= startDateSelector.value && p.data <= endDateSelector.value) : [];
        
        const kpis = calculateDashboardOEE(filteredDataForKpis);
        updateKpiCards(kpis);
        
        if (graphFilterMachine) {
            renderProductionTimelineChart(filteredDataForGraphs, graphFilterMachine);
            renderOeeByShiftChart(filteredDataForGraphs, graphFilterMachine);
        } else {
             if (productionTimelineChartInstance) productionTimelineChartInstance.destroy();
             if (oeeByShiftChartInstance) oeeByShiftChartInstance.destroy();
             const messageDiv = document.getElementById('timeline-chart-message');
             if (messageDiv) messageDiv.style.display = 'flex';
        }

        renderParetoChart(filteredDataForKpis);
    }
    
    function calculateDashboardOEE(data) {
        if (data.length === 0) return { disponibilidade: 0, performance: 0, qualidade: 0, oee: 0 };

        let totalTempoProgramado = 0;
        let totalTempoParada = 0;
        let totalProducaoBoa = 0;
        let totalProducaoTeorica = 0;
        let totalRefugoPcs = 0;

        const machineDays = new Set(data.map(d => `${d.machine}-${d.data}`));
        totalTempoProgramado = machineDays.size * 3 * 480;

        data.forEach(item => {
            const cicloReal = item[`real_cycle_${item.turno.toLowerCase()}`] || item.budgeted_cycle;
            const cavAtivas = item[`active_cavities_${item.turno.toLowerCase()}`] || item.mold_cavities;
            const pesoPeca = item.piece_weight;
            
            totalTempoParada += item.duracao_min || 0;
            totalProducaoBoa += item.produzido || 0;

            if (pesoPeca > 0) {
               totalRefugoPcs += Math.round(((item.refugo_kg || 0) * 1000) / pesoPeca);
            }
            
            if (cicloReal > 0 && cavAtivas > 0) {
                const tempoProduzindo = 480 - (item.duracao_min || 0);
                totalProducaoTeorica += (tempoProduzindo * 60 / cicloReal) * cavAtivas;
            }
        });
        
        const tempoProduzindoTotal = totalTempoProgramado - totalTempoParada;

        const disponibilidade = totalTempoProgramado > 0 ? (tempoProduzindoTotal / totalTempoProgramado) : 0;
        const performance = totalProducaoTeorica > 0 ? (totalProducaoBoa / totalProducaoTeorica) : 0;
        const qualidade = (totalProducaoBoa + totalRefugoPcs) > 0 ? (totalProducaoBoa / (totalProducaoBoa + totalRefugoPcs)) : 0;
        const oee = disponibilidade * performance * qualidade;

        return {
            disponibilidade: isNaN(disponibilidade) ? 0 : disponibilidade,
            performance: isNaN(performance) ? 0 : performance,
            qualidade: isNaN(qualidade) ? 0 : qualidade,
            oee: isNaN(oee) ? 0 : oee
        };
    }

    function updateKpiCards(kpis) {
        const disponibilidadeEl = document.getElementById('kpi-disponibilidade');
        const performanceEl = document.getElementById('kpi-performance');
        const qualidadeEl = document.getElementById('kpi-qualidade');
        const oeeEl = document.getElementById('kpi-oee');
        
        if (disponibilidadeEl) disponibilidadeEl.textContent = (kpis.disponibilidade * 100).toFixed(1) + '%';
        if (performanceEl) performanceEl.textContent = (kpis.performance * 100).toFixed(1) + '%';
        if (qualidadeEl) qualidadeEl.textContent = (kpis.qualidade * 100).toFixed(1) + '%';
        if (oeeEl) oeeEl.textContent = (kpis.oee * 100).toFixed(1) + '%';
    }

    function renderProductionTimelineChart(data, selectedMachine) {
        const ctx = document.getElementById('productionTimelineChart');
        if (!ctx) return;
        
        const messageDiv = document.getElementById('timeline-chart-message');
        
        if (productionTimelineChartInstance) productionTimelineChartInstance.destroy();
        
        if (!selectedMachine || selectedMachine === 'total') {
            ctx.style.display = 'none';
            if (messageDiv) messageDiv.style.display = 'flex';
            return;
        }
        ctx.style.display = 'block';
        if (messageDiv) messageDiv.style.display = 'none';
        
        const hourlyData = {};
        for (let i = 7; i < 24; i++) { hourlyData[`${String(i).padStart(2,'0')}:00`] = 0; }
        for (let i = 0; i < 7; i++) { hourlyData[`${String(i).padStart(2,'0')}:00`] = 0; }

        data.forEach(item => {
            const ts = item.timestamp?.toDate();
            if (!ts) return;
            const hour = `${String(ts.getHours()).padStart(2,'0')}:00`;
            if (hourlyData[hour] !== undefined) {
               hourlyData[hour] += item.produzido || 0;
            }
        });

        const sortedHours = Object.keys(hourlyData).sort((a,b) => {
            const hourA = parseInt(a.split(':')[0]);
            const hourB = parseInt(b.split(':')[0]);
            if (hourA >= 7 && hourB < 7) return -1;
            if (hourA < 7 && hourB >= 7) return 1;
            return hourA - hourB;
        });
        
        let cumulativeTotal = 0;
        const cumulativeProductionData = sortedHours.map(hour => {
            cumulativeTotal += hourlyData[hour];
            return cumulativeTotal;
        });

        const planItem = data.length > 0 ? data.find(d => d.planned_quantity > 0) : null;
        const metaDiaria = planItem ? planItem.planned_quantity : 0;
        const metaPorHora = metaDiaria / 24;
        
        let cumulativeTarget = 0;
        const cumulativeTargetData = sortedHours.map(() => {
            cumulativeTarget += metaPorHora;
            return cumulativeTarget;
        });
        
        let displayLabels = sortedHours;
        let displayProdData = cumulativeProductionData;
        let displayTargetData = cumulativeTargetData;
        
        const todayString = getProductionDateString();
        const viewingToday = (endDateSelector.value === todayString && startDateSelector.value === todayString);

        if (viewingToday) {
            const currentHour = new Date().getHours();
            let currentHourIndex = sortedHours.findIndex(h => parseInt(h.split(':')[0]) === currentHour);
            
            if (currentHourIndex === -1 && currentHour < 7) {
                currentHourIndex = 17 + currentHour;
            } else if (currentHourIndex === -1) {
                currentHourIndex = 23;
            }

            const sliceIndex = Math.min(currentHourIndex + 2, sortedHours.length);

            displayLabels = sortedHours.slice(0, sliceIndex);
            displayProdData = cumulativeProductionData.slice(0, sliceIndex);
            displayTargetData = cumulativeTargetData.slice(0, sliceIndex);
        }

        productionTimelineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: displayLabels,
                datasets: [
                    { 
                        label: 'Produção Acumulada', 
                        data: displayProdData, 
                        borderColor: '#0077C2',
                        backgroundColor: 'rgba(0, 119, 194, 0.1)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Meta Acumulada',
                        data: displayTargetData,
                        borderColor: '#DC2626',
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Quantidade de Peças' } } },
                plugins: { 
                    legend: { position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                hover: { mode: 'index', intersect: false }
            }
        });
    }

    function renderOeeByShiftChart(data, selectedMachine) {
        const ctx = document.getElementById('oeeByShiftChart');
        if (!ctx) return;
        
        if (oeeByShiftChartInstance) oeeByShiftChartInstance.destroy();
        
        if (!selectedMachine || selectedMachine === 'total') {
            return;
        }
        
        const oeeData = { T1: [], T2: [], T3: [] };
        data.forEach(item => {
            const refugoPcs = item.piece_weight > 0 ? ((item.refugo_kg || 0) * 1000) / item.piece_weight : 0;
            const oee = calculateShiftOEE(item.produzido || 0, item.duracao_min || 0, refugoPcs, item[`real_cycle_${item.turno.toLowerCase()}`] || item.budgeted_cycle, item[`active_cavities_${item.turno.toLowerCase()}`] || item.mold_cavities);
            if (oeeData[item.turno]) {
                oeeData[item.turno].push(oee.oee);
            }
        });

        const avgOee = (arr) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length) * 100 : 0;

        oeeByShiftChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Turno 1', 'Turno 2', 'Turno 3'],
                datasets: [{
                    label: 'Eficiência (OEE)',
                    data: [avgOee(oeeData.T1), avgOee(oeeData.T2), avgOee(oeeData.T3)],
                    backgroundColor: ['#4F46E5', '#10B981', '#0077C2']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    function renderParetoChart(data) {
        const ctx = document.getElementById('paretoChart');
        if (!ctx) return;
        
        if (paretoChartInstance) paretoChartInstance.destroy();

        const reasonCounts = data.reduce((acc, item) => {
            if(item.motivo_refugo && (item.refugo_kg || 0) > 0) {
                acc[item.motivo_refugo] = (acc[item.motivo_refugo] || 0) + (item.refugo_kg || 0);
            }
            return acc;
        }, {});

        const sortedReasons = Object.entries(reasonCounts).sort(([, a], [, b]) => b - a);
        const labels = sortedReasons.map(([reason]) => reason);
        const values = sortedReasons.map(([, count]) => count);
        const total = values.reduce((sum, val) => sum + val, 0);

        let cumulative = 0;
        const cumulativePercentage = values.map(val => {
            cumulative += val;
            return total > 0 ? (cumulative / total) * 100 : 0;
        });
        
        paretoChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Refugo (kg)',
                        data: values,
                        backgroundColor: 'rgba(220, 38, 38, 0.7)',
                        yAxisID: 'y'
                    },
                    {
                        label: 'Acumulado %',
                        data: cumulativePercentage,
                        type: 'line',
                        borderColor: '#4F46E5',
                        backgroundColor: 'rgba(79, 70, 229, 0.2)',
                        fill: false,
                        tension: 0.1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: { display: true, text: 'Kg' }},
                    y1: { type: 'linear', display: true, position: 'right', min: 0, max: 105, grid: { drawOnChartArea: false }, ticks: { callback: value => value + '%' } }
                }
            }
        });
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
