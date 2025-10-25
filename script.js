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
    let storage = null;
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        if (typeof firebase.storage === 'function') {
            storage = firebase.storage();
            console.log('Firebase Storage inicializado com sucesso');
        } else {
            console.warn('Firebase Storage não disponível. Upload de fotos será desativado.');
        }
        
        // Testar conexão com Firebase
        console.log('Firebase inicializado com sucesso');
        console.log('Firestore instance:', db);
        
        // Teste de conectividade básica
        db.collection('test').doc('connection-test').set({
            timestamp: new Date().toISOString(),
            test: true
        }).then(() => {
            console.log('✅ Teste de conexão Firebase bem-sucedido');
            
            // Testar específicamente as coleções que vamos usar
            return Promise.all([
                db.collection('production').doc('test').set({ test: true, timestamp: new Date() }),
                db.collection('losses').doc('test').set({ test: true, timestamp: new Date() }),
                db.collection('downtime').doc('test').set({ test: true, timestamp: new Date() })
            ]);
        }).then(() => {
            console.log('✅ Teste de escrita nas coleções principais bem-sucedido');
            
            // Limpar documentos de teste
            return Promise.all([
                db.collection('production').doc('test').delete(),
                db.collection('losses').doc('test').delete(),
                db.collection('downtime').doc('test').delete()
            ]);
        }).then(() => {
            console.log('✅ Limpeza dos documentos de teste concluída');
        }).catch((error) => {
            console.error('❌ Erro no teste de conexão Firebase:', error);
            console.error('Código do erro:', error.code);
            console.error('Mensagem do erro:', error.message);
            
            if (error.code === 'permission-denied') {
                console.error('🚨 PROBLEMA DE PERMISSÃO DETECTADO!');
                console.error('Verifique as regras de segurança do Firestore.');
                alert('Erro de permissão: Verifique as regras de segurança do Firebase Firestore. O banco pode estar configurado para bloquear escritas.');
            }
        });
        
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
    
    // Variáveis do novo painel de lançamento
    let selectedMachineData = null;
    let hourlyChartInstance = null;
    let productionTimer = null;
    let currentDowntimeStart = null;
    let downtimeTimer = null;
    let machineStatus = 'running'; // 'running' ou 'stopped'
    let recentEntriesCache = new Map();
    let allRecentEntries = []; // Armazenar todas as entradas para filtro
    let currentEntryFilter = 'all'; // Filtro atual: 'all', 'production', 'downtime', 'loss'
    let currentEditContext = null;

    let cachedProductionDataset = {
        productionData: [],
        planData: [],
        startDate: null,
        endDate: null,
        shift: 'all',
        machine: 'all'
    };
    let productionRateMode = 'day';

    // Variáveis globais para análise
    let machines = [];
    let currentAnalysisFilters = {};

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
    const planningMpInput = document.getElementById('planning-mp');
    const leaderLaunchPanel = document.getElementById('leader-launch-panel');
    const leaderModal = document.getElementById('leader-entry-modal');
    const leaderModalForm = document.getElementById('leader-entry-form');
    const leaderModalTitle = document.getElementById('leader-modal-title');
    
    const launchPanelContainer = document.getElementById('launch-panel-container');
    const productionModal = document.getElementById('production-entry-modal');
    const productionModalForm = document.getElementById('production-entry-form');
    const productionModalTitle = document.getElementById('production-modal-title');
    // Elementos do novo painel de lançamento
    const machineSelector = document.getElementById('machine-selector');
    const productionControlPanel = document.getElementById('production-control-panel');
    const hourlyProductionChart = document.getElementById('hourly-production-chart');
    const currentShiftDisplay = document.getElementById('current-shift-display');
    const machineIcon = document.getElementById('machine-icon');
    const machineName = document.getElementById('machine-name');
    const productName = document.getElementById('product-name');
    const productMp = document.getElementById('product-mp');
    const shiftTarget = document.getElementById('shift-target');
    const producedToday = document.getElementById('produced-today');
    const efficiencyToday = document.getElementById('efficiency-today');
    const lossesToday = document.getElementById('losses-today');
    const downtimeToday = document.getElementById('downtime-today');
    const recentEntriesList = document.getElementById('recent-entries-list');
    const recentEntriesLoading = document.getElementById('recent-entries-loading');
    const recentEntriesEmpty = document.getElementById('recent-entries-empty');
    const refreshRecentEntriesBtn = document.getElementById('refresh-recent-entries');

    updateRecentEntriesEmptyMessage('Selecione uma máquina para visualizar os lançamentos.');
    setRecentEntriesState({ loading: false, empty: true });
    
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
    const chartToggleTrendBtn = document.getElementById('chart-toggle-trend');
    const productionChartContainer = document.getElementById('production-chart-container');
    const oeeChartContainer = document.getElementById('oee-chart-container');
    const oeeTrendContainer = document.getElementById('oee-trend-container');
    const graphMachineFilter = document.getElementById('graph-machine-filter');

    // --- FUNÇÕES UTILITÁRIAS ---
    
    // Funções para normalizar datas conforme o ciclo de trabalho (7h a 7h do dia seguinte)
    // Turno 1: 07:00 - 15:00 | Turno 2: 15:00 - 23:00 | Turno 3: 23:00 - 07:00

    function getWorkDay(dateStr, timeStr) {
        if (!dateStr) return null;

        let hours = 12; // padrão neutro (meio-dia)
        if (typeof timeStr === 'string' && timeStr.includes(':')) {
            const [timeHours] = timeStr.split(':').map(Number);
            if (!Number.isNaN(timeHours)) {
                hours = timeHours;
            }
        }

        if (hours >= 7) {
            return dateStr;
        }

        const [year, month, day] = dateStr.split('-').map(Number);
        if ([year, month, day].some(n => Number.isNaN(n))) return dateStr;

        const baseDate = new Date(year, (month || 1) - 1, day || 1);
        baseDate.setDate(baseDate.getDate() - 1);
        return baseDate.toISOString().split('T')[0];
    }

    function getWorkDayFromTimestamp(timestamp) {
        if (!timestamp) return null;
        const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
        const isoString = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString();
        const [datePart, timePart] = isoString.split('T');
        return getWorkDay(datePart, timePart?.substring(0, 5));
    }

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

            if (collectionToDelete === 'production_entries' || collectionToDelete === 'downtime_entries') {
                recentEntriesCache.delete(docIdToDelete);
                await loadRecentEntries(false);
            }


        } catch (error) {
            console.error("Erro ao excluir: ", error);
            alert("Não foi possível excluir o item e/ou seus dados associados.");
        } finally {
            hideConfirmModal();
        }
    }

    // --- BANCO DE DADOS DE CAIXAS DE TARA ---
    const taraBoxesDatabase = {
        "H-01": { "peso": 0, "descricao": "caixa plastica" },
        "H-02": { "peso": 0, "descricao": "caixa plastica" },
        "H-03": { "peso": 0, "descricao": "caixa plastica" },
        "H-04": { "peso": 0, "descricao": "caixa plastica" },
        "H-05": { "peso": 0, "descricao": "caixa plastica" },
        "H-06": { "peso": 0, "descricao": "caixa plastica" },
        "H-07": { "peso": 0, "descricao": "caixa plastica" },
        "H-08": { "peso": 0, "descricao": "caixa plastica" },
        "H-09": { "peso": 0, "descricao": "caixa plastica" },
        "H-10": { "peso": 0, "descricao": "caixa plastica" },
        "H-11": { "peso": 0, "descricao": "caixa plastica" },
        "H-12": { "peso": 0, "descricao": "caixa plastica" },
        "H-13": { "peso": 0, "descricao": "caixa plastica" },
        "H-14": { "peso": 0, "descricao": "caixa plastica" },
        "H-15": { "peso": 0, "descricao": "caixa plastica" },
        "H-16": { "peso": 0, "descricao": "caixa plastica" },
        "H-17": { "peso": 0, "descricao": "caixa plastica" },
        "H-18": { "peso": 0, "descricao": "caixa plastica" },
        "H-19": { "peso": 0, "descricao": "caixa plastica" },
        "H-20": { "peso": 0, "descricao": "caixa plastica" },
        "H-26": { "peso": 0, "descricao": "caixa plastica" },
        "H-27": { "peso": 0, "descricao": "caixa plastica" },
        "H-28": { "peso": 0, "descricao": "caixa plastica" },
        "H-29": { "peso": 0, "descricao": "caixa plastica" },
        "H-30": { "peso": 0, "descricao": "caixa plastica" },
        "H-31": { "peso": 0, "descricao": "caixa plastica" },
        "H-32": { "peso": 0, "descricao": "caixa plastica" }
    };

    // --- FUNÇÕES DO NOVO SISTEMA DE LANÇAMENTOS POR HORA ---

    // Função para carregar lançamentos por hora
    async function loadHourlyEntries(planId, turno) {
        const entriesRef = db.collection('hourly_production_entries');
        const q = entriesRef.where('planId', '==', planId).where('turno', '==', turno);
        const querySnapshot = await q.get();
        
        const entriesContainer = document.getElementById('hourly-entries-container');
        if (!entriesContainer) return;
        
        entriesContainer.innerHTML = '';
        
        const hours = [
            '08:00', '09:00', '10:00', '11:00', '12:00',
            '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
            '19:00', '20:00', '21:00', '22:00', '23:00', '00:00',
            '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'
        ];
        
        const existingEntries = {};
        querySnapshot.forEach(doc => {
            const data = doc.data();
            existingEntries[data.hora] = { id: doc.id, ...data };
        });
        
        hours.forEach(hora => {
            const entry = existingEntries[hora] || { hora, peso_bruto: '', usar_tara: false, embalagem_fechada: '' };
            const entryElement = createHourlyEntryElement(entry, planId, turno);
            entriesContainer.appendChild(entryElement);
        });
        
        updateTotalCalculation();
        lucide.createIcons();
            // Atualizar aba de análise se estiver aberta
            await refreshAnalysisIfActive();
    }

    // Função para criar elemento de lançamento por hora
    function createHourlyEntryElement(entry, planId, turno) {
        const div = document.createElement('div');
        div.className = 'hourly-entry grid grid-cols-13 gap-2 items-center p-2 border-b text-sm';
        div.innerHTML = `
            <div class="col-span-2 font-medium">${entry.hora}</div>
            <div class="col-span-3">
                <input type="number" step="0.01" 
                       value="${entry.peso_bruto || ''}" 
                       placeholder="Peso bruto (kg)"
                       class="peso-bruto-input w-full p-1 border rounded"
                       data-hora="${entry.hora}">
            </div>
            <div class="col-span-2 flex items-center">
                <input type="checkbox" ${entry.usar_tara ? 'checked' : ''} 
                       class="usar-tara-checkbox mr-1"
                       data-hora="${entry.hora}">
                <span class="text-xs">Usar Tara</span>
            </div>
            <div class="col-span-2">
                <input type="number" 
                       value="${entry.embalagem_fechada || ''}" 
                       placeholder="Embalagens"
                       class="embalagem-fechada-input w-full p-1 border rounded"
                       data-hora="${entry.hora}">
            </div>
            <div class="col-span-3">
                <span class="pecas-calculadas text-sm font-semibold">0 peças</span>
            </div>
            <div class="col-span-1">
                ${entry.id ? 
                    `<button type="button" class="delete-hourly-entry text-red-600 hover:text-red-800" data-id="${entry.id}">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>` : 
                    ''
                }
            </div>
        `;
        return div;
    }

    // Função para buscar peso da peça do planejamento
    async function getPieceWeightFromPlan(planId) {
        try {
            const planDoc = await db.collection('planning').doc(planId).get();
            if (planDoc.exists) {
                return planDoc.data().piece_weight || 0;
            }
        } catch (error) {
            console.error("Erro ao buscar peso da peça:", error);
        }
        return 0;
    }

    // Função para calcular totais
    async function updateTotalCalculation() {
        const planId = document.getElementById('production-entry-plan-id').value;
        const pieceWeight = await getPieceWeightFromPlan(planId);
        const useTara = document.getElementById('use-tara-box').checked;
        const taraWeight = parseFloat(document.getElementById('tara-box-weight').value) || 0;
        
        let totalPesoLiquido = 0;
        let totalPecas = 0;
        
        // Calcular totais de cada hora
        document.querySelectorAll('.hourly-entry').forEach(entry => {
            const pesoBruto = parseFloat(entry.querySelector('.peso-bruto-input').value) || 0;
            const usarTara = entry.querySelector('.usar-tara-checkbox').checked;
            const embalagemFechada = parseInt(entry.querySelector('.embalagem-fechada-input').value) || 0;
            
            const pesoLiquido = usarTara && useTara ? 
                Math.max(0, pesoBruto - taraWeight) : pesoBruto;
            
            // Calcular peças: por peso + por embalagem fechada
            const pecasPorPeso = pieceWeight > 0 ? Math.round((pesoLiquido * 1000) / pieceWeight) : 0;
            const pecasPorEmbalagem = embalagemFechada; // Assumindo 1 embalagem = 1 peça
            
            const pecasTotal = pecasPorPeso + pecasPorEmbalagem;
            
            if (entry.querySelector('.pecas-calculadas')) {
                entry.querySelector('.pecas-calculadas').textContent = `${pecasTotal} peças`;
            }
            
            totalPesoLiquido += pesoLiquido;
            totalPecas += pecasTotal;
        });
        
        // Atualizar totais
        const totalPesoLiquidoEl = document.getElementById('total-peso-liquido');
        const totalPecasEl = document.getElementById('total-pecas');
        const produzidoInput = document.getElementById('production-entry-produzido');
        
        if (totalPesoLiquidoEl) totalPesoLiquidoEl.textContent = `${totalPesoLiquido.toFixed(2)} kg`;
        if (totalPecasEl) totalPecasEl.textContent = totalPecas.toLocaleString('pt-BR');
        if (produzidoInput) produzidoInput.value = totalPecas;
    }

    // Função para salvar lançamentos por hora
    async function saveHourlyEntries(planId, turno) {
        const entries = [];
        
        document.querySelectorAll('.hourly-entry').forEach(entry => {
            const hora = entry.querySelector('.peso-bruto-input').dataset.hora;
            const pesoBruto = parseFloat(entry.querySelector('.peso-bruto-input').value) || 0;
            const usarTara = entry.querySelector('.usar-tara-checkbox').checked;
            const embalagemFechada = parseInt(entry.querySelector('.embalagem-fechada-input').value) || 0;
            
            if (pesoBruto > 0 || embalagemFechada > 0) {
                entries.push({
                    planId,
                    turno,
                    hora,
                    peso_bruto: pesoBruto,
                    usar_tara: usarTara,
                    embalagem_fechada: embalagemFechada,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        
        // Salvar no Firestore
        const batch = db.batch();
        entries.forEach(entry => {
            const docRef = db.collection('hourly_production_entries').doc();
            batch.set(docRef, entry);
        });
        
        await batch.commit();
    }

    // --- INITIALIZATION ---
    function init() {
        setTodayDate();
        setupEventListeners();
        setupPlanningTab();
        setupLaunchTab();
        setupAnalysisTab();
        populateLossOptions();
        
        // Inicializar dados básicos
        loadAnalysisMachines();
        populateQuickFormOptions();
        populateLaunchMachineSelector();
        
        // Verificar se os elementos críticos existem
        setTimeout(() => {
            console.log('🔍 Verificando elementos críticos...');
            console.log('machine-selector:', !!document.getElementById('machine-selector'));
            console.log('quick-production-form:', !!document.getElementById('quick-production-form'));
            console.log('quick-losses-form:', !!document.getElementById('quick-losses-form'));
            console.log('quick-downtime-form:', !!document.getElementById('quick-downtime-form'));
            console.log('btn-losses:', !!document.getElementById('btn-losses'));
            console.log('btn-downtime:', !!document.getElementById('btn-downtime'));
        }, 1000);
        
        if (productionModalForm && !document.getElementById('production-entry-plan-id')) {
            const planIdInput = document.createElement('input');
            planIdInput.type = 'hidden';
            planIdInput.id = 'production-entry-plan-id';
            planIdInput.name = 'planId';
            productionModalForm.prepend(planIdInput);
        }
        
        // Iniciar atualização automática de OEE em tempo real (a cada 5 minutos)
        setInterval(updateRealTimeOeeData, 5 * 60 * 1000);
        
        // Atualizar imediatamente se estivermos na aba de dashboard ou análise
        setTimeout(updateRealTimeOeeData, 2000);
        
        // Final da inicialização
        listenToPlanningChanges(getProductionDateString());
        lucide.createIcons();
    }
    
    // Função para atualizar dados de OEE em tempo real
    async function updateRealTimeOeeData() {
        try {
            // Verificar se estamos na aba de dashboard ou análise
            const currentPage = document.querySelector('.nav-btn.active')?.dataset.page;
            if (currentPage !== 'analise') {
                return;
            }
            
            // Verificar se estamos visualizando dados de hoje
            const today = getProductionDateString();
            const selectedDate = resumoDateSelector ? resumoDateSelector.value : today;
            
            if (selectedDate !== today) {
                return;
            }
            
            // Recarregar dados apenas se estiver na visualização atual
            const currentView = document.querySelector('.analysis-tab-btn.active')?.dataset.view;
            
            if (currentView === 'dashboard') {
                // Atualizar dados do dashboard sem mostrar loading
                const startDate = startDateSelector ? startDateSelector.value : today;
                const endDate = endDateSelector ? endDateSelector.value : today;
                
                if (startDate === today && endDate === today) {
                    const prodSnapshot = await db.collection('production_entries')
                        .where('data', '==', today)
                        .get();
                    const productions = prodSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    if (productions.length > 0) {
                        const planIds = [...new Set(productions.map(p => p.planId))];
                        const plans = {};
                        
                        for (let i = 0; i < planIds.length; i += 10) {
                            const batchIds = planIds.slice(i, i + 10);
                            if (batchIds.length > 0) {
                                const planBatchSnapshot = await db.collection('planning')
                                    .where(firebase.firestore.FieldPath.documentId(), 'in', batchIds)
                                    .get();
                                planBatchSnapshot.docs.forEach(doc => {
                                    plans[doc.id] = doc.data();
                                });
                            }
                        }
                        
                        const combinedData = productions.filter(prod => plans[prod.planId])
                            .map(prod => ({ ...prod, ...plans[prod.planId] }));
                        
                        fullDashboardData = { perdas: combinedData };
                        processAndRenderDashboard(fullDashboardData);
                    }
                }
            } else if (currentView === 'resumo') {
                // Atualizar dados do resumo silenciosamente
                loadResumoData(false); // false = não mostrar loading
            }
            
        } catch (error) {
            console.error("Erro ao atualizar dados OEE em tempo real: ", error);
        }
    }
    
    // Função para configurar a aba de lançamento
    function setupLaunchTab() {
        console.log('🔧 Configurando aba de lançamento...');
        
        // Event listeners para o seletor de máquina
        if (machineSelector) {
            machineSelector.addEventListener('change', (e) => {
                onMachineSelected(e.target.value);
            });
            console.log('✅ Event listener do seletor de máquina configurado');
        } else {
            console.log('❌ Seletor de máquina não encontrado');
        }
        
        // Event listeners para os botões de ação
        const btnLosses = document.getElementById('btn-losses');
        const btnDowntime = document.getElementById('btn-downtime');
        
        console.log('Botões encontrados:', {
            losses: !!btnLosses,
            downtime: !!btnDowntime
        });
        
        if (btnLosses) btnLosses.addEventListener('click', openLossesModal);
        if (btnDowntime) btnDowntime.addEventListener('click', toggleDowntime);
        
        // Event listeners para os modais
        const quickProductionForm = document.getElementById('quick-production-form');
        const quickProductionClose = document.getElementById('quick-production-close');
        const quickProductionCancel = document.getElementById('quick-production-cancel');
        
        const quickLossesForm = document.getElementById('quick-losses-form');
        const quickLossesClose = document.getElementById('quick-losses-close');
        const quickLossesCancel = document.getElementById('quick-losses-cancel');
        
        const quickDowntimeForm = document.getElementById('quick-downtime-form');
        const quickDowntimeClose = document.getElementById('quick-downtime-close');
        const quickDowntimeCancel = document.getElementById('quick-downtime-cancel');
        
        console.log('Formulários encontrados:', {
            productionForm: !!quickProductionForm,
            lossesForm: !!quickLossesForm,
            downtimeForm: !!quickDowntimeForm
        });
        
        if (quickProductionForm) {
            quickProductionForm.addEventListener('submit', handleProductionSubmit);
            console.log('✅ Event listener do formulário de produção configurado');
        } else {
            console.log('❌ Formulário de produção não encontrado');
        }
        
        if (quickProductionClose) quickProductionClose.addEventListener('click', () => closeModal('quick-production-modal'));
        if (quickProductionCancel) quickProductionCancel.addEventListener('click', () => closeModal('quick-production-modal'));
        
        if (quickLossesForm) {
            quickLossesForm.addEventListener('submit', handleLossesSubmit);
            console.log('✅ Event listener do formulário de perdas configurado');
        } else {
            console.log('❌ Formulário de perdas não encontrado');
        }
        
        if (quickLossesClose) quickLossesClose.addEventListener('click', () => closeModal('quick-losses-modal'));
        if (quickLossesCancel) quickLossesCancel.addEventListener('click', () => closeModal('quick-losses-modal'));
        
        if (quickDowntimeForm) {
            quickDowntimeForm.addEventListener('submit', handleDowntimeSubmit);
            console.log('✅ Event listener do formulário de paradas configurado');
        } else {
            console.log('❌ Formulário de paradas não encontrado');
        }
        
        if (quickDowntimeClose) quickDowntimeClose.addEventListener('click', () => closeModal('quick-downtime-modal'));
        if (quickDowntimeCancel) quickDowntimeCancel.addEventListener('click', () => closeModal('quick-downtime-modal'));
        
        console.log('✅ Aba de lançamento configurada');
    }

    // Configuração da aba de análise avançada
    function setupAnalysisTab() {
        console.log('🔧 Configurando aba de análise...');
        
        // Event listeners para as abas de análise
        document.querySelectorAll('.analysis-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.getAttribute('data-view');
                if (view) switchAnalysisView(view);
            });
        });

        // Event listeners para filtros
        const periodSelector = document.getElementById('analysis-period');
        const machineSelector = document.getElementById('analysis-machine');
        const applyFiltersBtn = document.getElementById('apply-analysis-filters');

        if (periodSelector) {
            periodSelector.addEventListener('change', (e) => {
                const customRange = document.getElementById('custom-date-range');
                if (e.target.value === 'custom') {
                    customRange.classList.remove('hidden');
                } else {
                    customRange.classList.add('hidden');
                }
            });
        }

        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', applyAnalysisFilters);
        }

        // Event listeners para comparação
        const generateComparisonBtn = document.getElementById('generate-comparison');
        if (generateComparisonBtn) {
            generateComparisonBtn.addEventListener('click', generateComparison);
        }

        // Event listener para botão de teste
        const testChartsBtn = document.getElementById('test-charts-btn');
        if (testChartsBtn) {
            testChartsBtn.addEventListener('click', () => {
                console.log('🧪 [TEST] Teste manual iniciado');
                testAllCharts();
                diagnosticFirestoreData();
            });
        }

        const rateDayBtn = document.getElementById('production-rate-mode-day');
        const rateShiftBtn = document.getElementById('production-rate-mode-shift');
        if (rateDayBtn && rateShiftBtn) {
            rateDayBtn.addEventListener('click', () => {
                if (productionRateMode === 'day') return;
                productionRateMode = 'day';
                updateProductionRateToggle();
                updateProductionRateDisplay();
            });
            rateShiftBtn.addEventListener('click', () => {
                if (productionRateMode === 'shift') return;
                productionRateMode = 'shift';
                updateProductionRateToggle();
                updateProductionRateDisplay();
            });
            updateProductionRateToggle();
        }

        // Carregar dados iniciais
        loadAnalysisMachines();
        setAnalysisDefaultDates();
        
        // Executar diagnósticos
        diagnosticFirestoreData();
        
        // Carregar dados da view inicial (overview)
        setTimeout(() => {
            loadAnalysisData('overview');
            // Testar todos os gráficos após 2 segundos
            setTimeout(() => {
                testAllCharts();
            }, 2000);
        }, 100);
        
        console.log('✅ Aba de análise configurada');
    }

    // Função para trocar entre views de análise
    function switchAnalysisView(viewName) {
        // Atualizar botões
        document.querySelectorAll('.analysis-tab-btn').forEach(btn => {
            btn.classList.remove('active', 'border-primary-blue', 'text-primary-blue');
            btn.classList.add('border-transparent', 'text-gray-500');
        });
        
        const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'border-primary-blue', 'text-primary-blue');
            activeBtn.classList.remove('border-transparent', 'text-gray-500');
        }

        // Mostrar/ocultar views
        document.querySelectorAll('.analysis-view').forEach(view => {
            view.classList.add('hidden');
        });
        
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.remove('hidden');
            // Carregar dados específicos da view
            loadAnalysisData(viewName);
        }
    }

    // Função para aplicar filtros de análise
    async function applyAnalysisFilters() {
        const period = document.getElementById('analysis-period').value;
        const machine = document.getElementById('analysis-machine').value;
        const shift = document.getElementById('analysis-shift').value;
        
        const toIsoDate = (dateObj) => new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        let startDate, endDate;
        const workToday = getProductionDateString();
        const baseDate = new Date(`${workToday}T12:00:00`);
        
        switch (period) {
            case 'today':
                startDate = endDate = workToday;
                break;
            case 'yesterday':
                const yesterday = new Date(baseDate);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = endDate = toIsoDate(yesterday);
                break;
            case '7days':
                const week = new Date(baseDate);
                week.setDate(week.getDate() - 6);
                startDate = toIsoDate(week);
                endDate = workToday;
                break;
            case '30days':
                const month = new Date(baseDate);
                month.setDate(month.getDate() - 29);
                startDate = toIsoDate(month);
                endDate = workToday;
                break;
            case 'month':
                startDate = toIsoDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
                endDate = workToday;
                break;
            case 'lastmonth':
                const lastMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
                const lastMonthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), 0);
                startDate = toIsoDate(lastMonth);
                endDate = toIsoDate(lastMonthEnd);
                break;
            case 'custom':
                startDate = document.getElementById('analysis-start-date').value;
                endDate = document.getElementById('analysis-end-date').value;
                break;
        }

        if (!startDate) startDate = workToday;
        if (!endDate) endDate = workToday;

        // Atualizar dados com filtros
        currentAnalysisFilters = { startDate, endDate, machine, shift };
        
        // Recarregar a view atual
        const activeView = document.querySelector('.analysis-tab-btn.active')?.getAttribute('data-view') || 'overview';
        loadAnalysisData(activeView);
    }

    // Função para carregar dados de análise
    async function loadAnalysisData(viewName = 'overview') {
        console.log('[TRACE][loadAnalysisData] start', { viewName, filters: currentAnalysisFilters });
        
        // Garantir que os filtros estejam inicializados
        if (!currentAnalysisFilters.startDate || !currentAnalysisFilters.endDate) {
            console.log('[TRACE][loadAnalysisData] initializing default filters');
            setAnalysisDefaultDates();
        }
        
        showAnalysisLoading(true);
        
        try {
            switch (viewName) {
                case 'overview':
                    await loadOverviewData();
                    break;
                case 'production':
                    await loadProductionAnalysis();
                    break;
                case 'efficiency':
                    await loadEfficiencyAnalysis();
                    break;
                case 'losses':
                    await loadLossesAnalysis();
                    break;
                case 'downtime':
                    await loadDowntimeAnalysis();
                    break;
                case 'comparative':
                    await loadComparativeAnalysis();
                    break;
            }
        } catch (error) {
            console.error('Erro ao carregar dados de análise:', error);
            showAnalysisError();
        } finally {
            showAnalysisLoading(false);
            console.log('[TRACE][loadAnalysisData] end', { viewName });
        }
    }

    // Função para carregar visão geral
    async function loadOverviewData() {
        const { startDate, endDate, machine, shift } = currentAnalysisFilters;
        console.log('[TRACE][loadOverviewData] fetching data', { startDate, endDate, machine, shift });
        
        if (!startDate || !endDate) {
            console.warn('[TRACE][loadOverviewData] missing date filters, initializing defaults');
            setAnalysisDefaultDates();
            return;
        }
        
        // Buscar dados do Firebase (sempre sem filtro de turno para permitir comparação geral)
        const [productionAll, lossesAll, downtimeAll, planData] = await Promise.all([
            getFilteredData('production', startDate, endDate, machine, 'all'),
            getFilteredData('losses', startDate, endDate, machine, 'all'),
            getFilteredData('downtime', startDate, endDate, machine, 'all'),
            getFilteredData('plan', startDate, endDate, machine, 'all')
        ]);

        console.log('[TRACE][loadOverviewData] datasets received', {
            productionCount: productionAll.length,
            lossesCount: lossesAll.length,
            downtimeCount: downtimeAll.length,
            planCount: planData.length,
            productionSample: productionAll.slice(0, 2),
            lossesSample: lossesAll.slice(0, 2),
            downtimeSample: downtimeAll.slice(0, 2)
        });

        const normalizeShiftFilter = (value) => {
            if (value === undefined || value === null || value === 'all') return 'all';
            const num = Number(value);
            return Number.isFinite(num) ? num : 'all';
        };

        const appliedShift = normalizeShiftFilter(shift);

        const filterByShift = (data) => {
            if (appliedShift === 'all') return data;
            return data.filter(item => Number(item.shift || 0) === appliedShift);
        };

        const productionData = filterByShift(productionAll);
        const lossesData = filterByShift(lossesAll);
        const downtimeData = filterByShift(downtimeAll);

        // Calcular KPIs básicos
        const totalProduction = productionData.reduce((sum, item) => sum + item.quantity, 0);
        const totalLosses = lossesData.reduce((sum, item) => sum + item.quantity, 0);
        const totalDowntime = downtimeData.reduce((sum, item) => sum + (item.duration || 0), 0);
        
        // Calcular OEE real usando disponibilidade × performance × qualidade
        const { overallOee, filteredOee } = calculateOverviewOEE(
            productionAll,
            lossesAll,
            downtimeAll,
            planData,
            appliedShift
        );
        const displayedOee = appliedShift === 'all' ? overallOee : filteredOee;
        
        // Atualizar KPIs na interface
        const overviewOee = document.getElementById('overview-oee');
        const overviewProduction = document.getElementById('overview-production');
        const overviewLosses = document.getElementById('overview-losses');
        const overviewDowntime = document.getElementById('overview-downtime');
        
        if (overviewOee) {
            if (appliedShift === 'all') {
                overviewOee.textContent = `${(overallOee * 100).toFixed(1)}%`;
            } else {
                overviewOee.textContent = `Turno: ${(filteredOee * 100).toFixed(1)}% | Geral: ${(overallOee * 100).toFixed(1)}%`;
            }
        }
        if (overviewProduction) overviewProduction.textContent = totalProduction.toLocaleString();
        if (overviewLosses) overviewLosses.textContent = totalLosses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (overviewDowntime) overviewDowntime.textContent = `${(totalDowntime / 60).toFixed(1)}h`;

        console.log('[TRACE][loadOverviewData] KPIs calculated', { 
            overallOee: (overallOee * 100).toFixed(1) + '%',
            filteredOee: (filteredOee * 100).toFixed(1) + '%',
            totalProduction, 
            totalLosses, 
            totalDowntime 
        });

        // Gerar gráficos
        await generateOEEDistributionChart(productionData, lossesData, downtimeData);
        await generateOEETrendChart(startDate, endDate);
    }

    function aggregateOeeMetrics(productionData, lossesData, downtimeData, planData, shiftFilter = 'all') {
        const toShiftNumber = (value) => {
            if (value === null || value === undefined) return null;
            const num = Number(value);
            return Number.isFinite(num) && num > 0 ? num : null;
        };

        const determineShiftFromTime = (timeStr) => {
            if (!timeStr || typeof timeStr !== 'string') return null;
            const [hoursStr, minutesStr] = timeStr.split(':');
            const hours = Number(hoursStr);
            if (!Number.isFinite(hours)) return null;
            if (hours >= 7 && hours < 15) return 1;
            if (hours >= 15 && hours < 23) return 2;
            return 3;
        };

        const determineShiftFromDate = (dateObj) => {
            if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
            const hours = dateObj.getHours();
            return determineShiftFromTime(`${String(hours).padStart(2, '0')}:00`);
        };

        const inferShift = (item) => {
            const candidates = [
                item.shift,
                item?.raw?.shift,
                item?.raw?.turno,
                item?.raw?.Shift,
                item?.raw?.Turno
            ];
            for (const value of candidates) {
                const shiftNum = toShiftNumber(value);
                if (shiftNum) return shiftNum;
            }

            const timeCandidates = [
                item.startTime,
                item.endTime,
                item?.raw?.startTime,
                item?.raw?.endTime,
                item?.raw?.hora,
                item?.raw?.hour,
                item?.raw?.time
            ];
            for (const time of timeCandidates) {
                const shiftNum = determineShiftFromTime(time);
                if (shiftNum) return shiftNum;
            }

            const dateCandidates = [];
            if (item.datetime) {
                const parsed = new Date(item.datetime);
                if (!Number.isNaN(parsed.getTime())) dateCandidates.push(parsed);
            }
            if (item?.raw?.timestamp?.toDate) {
                dateCandidates.push(item.raw.timestamp.toDate());
            }
            if (item?.raw?.createdAt?.toDate) {
                dateCandidates.push(item.raw.createdAt.toDate());
            }
            if (item?.raw?.updatedAt?.toDate) {
                dateCandidates.push(item.raw.updatedAt.toDate());
            }
            for (const date of dateCandidates) {
                const shiftNum = determineShiftFromDate(date);
                if (shiftNum) return shiftNum;
            }

            return null;
        };

        const inferMachine = (item) => item.machine || item?.raw?.machine || item?.raw?.machineRef || item?.raw?.machine_id || null;

        const groupKey = (machine, shift) => `${machine || 'unknown'}_${shift ?? 'none'}`;
        const grouped = {};

        const getOrCreateGroup = (item) => {
            const machine = inferMachine(item);
            const shiftNum = inferShift(item);
            if (!machine || !shiftNum) return null;
            const key = groupKey(machine, shiftNum);
            if (!grouped[key]) {
                grouped[key] = {
                    machine,
                    shift: shiftNum,
                    production: 0,
                    lossesKg: 0,
                    downtimeMin: 0
                };
            }
            return grouped[key];
        };

        productionData.forEach(item => {
            const group = getOrCreateGroup(item);
            if (!group) return;
            group.production += item.quantity || 0;
        });

        lossesData.forEach(item => {
            const group = getOrCreateGroup(item);
            if (!group) return;
            group.lossesKg += item.quantity || 0;
        });

        downtimeData.forEach(item => {
            const group = getOrCreateGroup(item);
            if (!group) return;
            group.downtimeMin += item.duration || 0;
        });

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const groupsWithMetrics = [];

        Object.values(grouped).forEach(group => {
            const planCandidates = planData.filter(p => p && p.raw && p.machine === group.machine);
            if (!planCandidates.length) return;

            const plan = planCandidates.find(p => {
                const planShift = Number(p.shift || 0);
                return planShift && planShift === group.shift;
            }) || planCandidates[0];

            if (!plan || !plan.raw) return;

            const shiftKey = `t${group.shift}`;
            const cicloReal = plan.raw[`real_cycle_${shiftKey}`] || plan.raw.budgeted_cycle || 0;
            const cavAtivas = plan.raw[`active_cavities_${shiftKey}`] || plan.raw.mold_cavities || 0;
            const pieceWeight = plan.raw.piece_weight || 0;

            const refugoPcs = pieceWeight > 0 ? Math.round((group.lossesKg * 1000) / pieceWeight) : 0;

            const metrics = calculateShiftOEE(
                group.production,
                group.downtimeMin,
                refugoPcs,
                cicloReal,
                cavAtivas
            );

            groupsWithMetrics.push({
                machine: group.machine,
                shift: group.shift,
                disponibilidade: clamp01(metrics.disponibilidade),
                performance: clamp01(metrics.performance),
                qualidade: clamp01(metrics.qualidade),
                oee: clamp01(metrics.oee)
            });
        });

        const averageMetric = (items, selector) => {
            if (!items.length) return 0;
            const total = items.reduce((sum, item) => sum + selector(item), 0);
            return total / items.length;
        };

        const normalizedShift = shiftFilter === 'all' ? 'all' : toShiftNumber(shiftFilter);
        const filteredGroups = normalizedShift === 'all'
            ? groupsWithMetrics
            : groupsWithMetrics.filter(item => item.shift === normalizedShift);

        const overall = {
            disponibilidade: averageMetric(groupsWithMetrics, item => item.disponibilidade),
            performance: averageMetric(groupsWithMetrics, item => item.performance),
            qualidade: averageMetric(groupsWithMetrics, item => item.qualidade),
            oee: averageMetric(groupsWithMetrics, item => item.oee)
        };

        const filtered = {
            disponibilidade: averageMetric(filteredGroups, item => item.disponibilidade),
            performance: averageMetric(filteredGroups, item => item.performance),
            qualidade: averageMetric(filteredGroups, item => item.qualidade),
            oee: averageMetric(filteredGroups, item => item.oee)
        };

        return {
            overall,
            filtered,
            groups: groupsWithMetrics
        };
    }

    // Função para calcular OEE real do overview agregando todos os turnos/máquinas
    function calculateOverviewOEE(productionData, lossesData, downtimeData, planData, shiftFilter = 'all') {
        const { overall, filtered } = aggregateOeeMetrics(
            productionData,
            lossesData,
            downtimeData,
            planData,
            shiftFilter
        );

        return {
            overallOee: overall.oee,
            filteredOee: filtered.oee
        };
    }

    // Função para carregar análise de produção
    async function loadProductionAnalysis() {
        const { startDate, endDate, machine, shift } = currentAnalysisFilters;
        console.log('[TRACE][loadProductionAnalysis] fetching data', { startDate, endDate, machine, shift });
        
        const productionData = await getFilteredData('production', startDate, endDate, machine, shift);
        const planData = await getFilteredData('plan', startDate, endDate, machine, shift);

        console.log('[TRACE][loadProductionAnalysis] datasets received', {
            productionCount: productionData.length,
            planCount: planData.length
        });
        
        // Calcular métricas
        const totalProduction = productionData.reduce((sum, item) => sum + item.quantity, 0);
        const totalPlan = planData.reduce((sum, item) => sum + item.quantity, 0);
        const targetVsActual = totalPlan > 0 ? (totalProduction / totalPlan * 100) : 0;
        
        // Encontrar máquina top
        const machineProduction = {};
        productionData.forEach(item => {
            machineProduction[item.machine] = (machineProduction[item.machine] || 0) + item.quantity;
        });
        const topMachine = Object.keys(machineProduction).reduce((a, b) => 
            machineProduction[a] > machineProduction[b] ? a : b, '---'
        );

        cachedProductionDataset = {
            productionData,
            planData,
            startDate,
            endDate,
            shift,
            machine
        };

        // Atualizar interface
        document.getElementById('production-target-vs-actual').textContent = `${targetVsActual.toFixed(1)}%`;
        document.getElementById('top-machine').textContent = topMachine;
        updateProductionRateDisplay();

        // Gerar gráficos
        await generateHourlyProductionChart(productionData);
        await generateShiftProductionChart(productionData);
        // await generateMachineProductionTimeline(productionData); // TODO: implementar
    }

    function updateProductionRateToggle() {
        const dayBtn = document.getElementById('production-rate-mode-day');
        const shiftBtn = document.getElementById('production-rate-mode-shift');
        if (!dayBtn || !shiftBtn) return;

        const applyState = (btn, isActive) => {
            btn.classList.remove('bg-green-600', 'text-white', 'bg-white', 'text-green-600', 'hover:bg-green-50');
            if (isActive) {
                btn.classList.add('bg-green-600', 'text-white');
            } else {
                btn.classList.add('bg-white', 'text-green-600', 'hover:bg-green-50');
            }
        };

        applyState(dayBtn, productionRateMode === 'day');
        applyState(shiftBtn, productionRateMode === 'shift');
    }

    function updateProductionRateDisplay() {
        const valueEl = document.getElementById('production-rate-value');
        const subtextEl = document.getElementById('production-rate-subtext');
        if (!valueEl) return;

        const dataset = cachedProductionDataset || {};
        const productionData = dataset.productionData || [];
        const startDate = dataset.startDate;
        const endDate = dataset.endDate;
        const shiftFilterRaw = dataset.shift;
        const shiftFilter = shiftFilterRaw != null ? String(shiftFilterRaw) : 'all';

        if (!productionData.length) {
            valueEl.textContent = '--- pcs/h';
            if (subtextEl) {
                const modeLabel = productionRateMode === 'shift' ? 'Modo turno' : 'Modo dia';
                subtextEl.textContent = `${modeLabel} • Sem registros no período selecionado.`;
            }
            return;
        }

        const totalProduction = productionData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const workDaysSet = new Set(productionData.map(item => item.workDay || item.date).filter(Boolean));
        const workDaysCount = workDaysSet.size;

        let effectiveDays = workDaysCount;
        if (!effectiveDays) {
            if (startDate && endDate) {
                const baseStart = new Date(`${startDate}T00:00:00`);
                const baseEnd = new Date(`${endDate}T00:00:00`);
                const diffDays = Math.max(Math.round((baseEnd - baseStart) / (1000 * 60 * 60 * 24)) + 1, 1);
                effectiveDays = diffDays;
            } else {
                effectiveDays = 1;
            }
        }

        if (productionRateMode === 'day') {
            let hoursInPeriod = 0;
            if (startDate && endDate) {
                hoursInPeriod = calculateHoursInPeriod(startDate, endDate);
            }
            if (!hoursInPeriod) {
                hoursInPeriod = effectiveDays * 24;
            }

            const rate = hoursInPeriod > 0 ? totalProduction / hoursInPeriod : 0;
            valueEl.textContent = `${rate.toFixed(1)} pcs/h`;

            if (subtextEl) {
                const daysLabel = effectiveDays > 1 ? `${effectiveDays} dias` : '1 dia';
                const dataDaysLabel = workDaysCount && workDaysCount !== effectiveDays ? `, ${workDaysCount} com lançamentos` : '';
                subtextEl.textContent = `Modo dia • ${totalProduction.toLocaleString('pt-BR')} peças em ${daysLabel}${dataDaysLabel}.`;
            }
            return;
        }

        const hoursPerShift = 8;
        const denominator = Math.max(effectiveDays * hoursPerShift, 1);
        const shiftTotals = { '1': 0, '2': 0, '3': 0 };
        let unknownTotal = 0;

        productionData.forEach(item => {
            const shiftValue = item.shift;
            const normalizedShift = shiftValue != null ? String(shiftValue) : null;
            const qty = Number(item.quantity) || 0;
            if (normalizedShift && Object.prototype.hasOwnProperty.call(shiftTotals, normalizedShift)) {
                shiftTotals[normalizedShift] += qty;
            } else {
                unknownTotal += qty;
            }
        });

        const shiftRates = ['1', '2', '3'].map(shiftKey => {
            const total = shiftTotals[shiftKey] || 0;
            const rate = total > 0 ? total / denominator : 0;
            return { shift: shiftKey, total, rate };
        });

        const selectedShift = shiftFilter !== 'all' ? shiftFilter : 'all';

        if (selectedShift !== 'all' && ['1', '2', '3'].includes(selectedShift)) {
            const selectedData = shiftRates.find(r => r.shift === selectedShift);
            if (selectedData && selectedData.total > 0) {
                valueEl.textContent = `Turno ${selectedData.shift}: ${selectedData.rate.toFixed(1)} pcs/h`;
            } else {
                valueEl.textContent = `Turno ${selectedShift}: -- pcs/h`;
            }
        } else {
            const bestShift = shiftRates.reduce((best, current) => {
                if (current.total <= 0) return best;
                if (!best || current.rate > best.rate) {
                    return current;
                }
                return best;
            }, null);

            if (bestShift) {
                valueEl.textContent = `Melhor turno: T${bestShift.shift} ${bestShift.rate.toFixed(1)} pcs/h`;
            } else {
                valueEl.textContent = 'Sem dados por turno';
            }
        }

        if (subtextEl) {
            const detailParts = shiftRates.map(r => {
                const label = `T${r.shift}`;
                return r.total > 0 ? `${label}: ${r.rate.toFixed(1)} pcs/h` : `${label}: --`;
            });
            if (unknownTotal > 0) {
                detailParts.push(`Sem turno: ${unknownTotal.toLocaleString('pt-BR')} pcs`);
            }
            const daysLabel = effectiveDays > 1 ? `${effectiveDays} dias` : '1 dia';
            subtextEl.textContent = `Modo turno • ${detailParts.join(' • ')} • ${daysLabel} analisado(s).`;
        }
    }

    // Função para carregar análise de eficiência
    async function loadEfficiencyAnalysis() {
        const { startDate, endDate, machine, shift } = currentAnalysisFilters;
        console.log('[TRACE][loadEfficiencyAnalysis] calculating', { startDate, endDate, machine, shift });
        
        const oeeData = await calculateDetailedOEE(startDate, endDate, machine, shift);

        console.log('[TRACE][loadEfficiencyAnalysis] oeeData', oeeData);
        
        // Atualizar gauges
        updateGauge('availability-gauge', oeeData.availability);
        updateGauge('performance-gauge', oeeData.performance);
        updateGauge('quality-gauge', oeeData.quality);
        
        document.getElementById('availability-value').textContent = `${oeeData.availability.toFixed(1)}%`;
        document.getElementById('performance-value').textContent = `${oeeData.performance.toFixed(1)}%`;
        document.getElementById('quality-value').textContent = `${oeeData.quality.toFixed(1)}%`;

        // Gerar gráficos
        await generateOEEComponentsTimeline(startDate, endDate, machine);
        await generateOEEHeatmap(startDate, endDate);
    }

    // Função para carregar análise de perdas
    async function loadLossesAnalysis() {
        const { startDate, endDate, machine, shift } = currentAnalysisFilters;
        console.log('[TRACE][loadLossesAnalysis] fetching data', { startDate, endDate, machine, shift });
        
        const lossesData = await getFilteredData('losses', startDate, endDate, machine, shift);
        const productionData = await getFilteredData('production', startDate, endDate, machine, shift);

        console.log('[TRACE][loadLossesAnalysis] datasets received', {
            lossesCount: lossesData.length,
            productionCount: productionData.length
        });
        
        const totalLosses = lossesData.reduce((sum, item) => sum + item.quantity, 0);
        const totalProduction = productionData.reduce((sum, item) => sum + item.quantity, 0);
        const lossesPercentage = totalProduction > 0 ? (totalLosses / totalProduction * 100) : 0;
        
        // Calcular principal motivo
        const reasonCounts = {};
        lossesData.forEach(item => {
            reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + item.quantity;
        });
        const mainReason = Object.keys(reasonCounts).reduce((a, b) => 
            reasonCounts[a] > reasonCounts[b] ? a : b, '---'
        );
        
        // Calcular MP mais perdida
        const materialCounts = {};
        lossesData.forEach(item => {
            const mpType = item.mp_type || 'Não especificado';
            materialCounts[mpType] = (materialCounts[mpType] || 0) + item.quantity;
        });
        const mainMaterial = Object.keys(materialCounts).length > 0 
            ? Object.keys(materialCounts).reduce((a, b) => 
                materialCounts[a] > materialCounts[b] ? a : b, '---'
            ) 
            : '---';

        // Atualizar interface
        document.getElementById('total-losses').textContent = totalLosses.toLocaleString();
        document.getElementById('losses-percentage').textContent = `${lossesPercentage.toFixed(1)}%`;
        document.getElementById('main-loss-reason').textContent = mainReason;
        document.getElementById('main-loss-material').textContent = mainMaterial;

        // Gerar gráficos
        await generateLossesParetoChart(lossesData);
        await generateLossesByMachineChart(lossesData);
        await generateLossesByMaterialChart(lossesData);
        await generateLossesTrendChart(lossesData, startDate, endDate);
    }

    // Função para carregar análise de paradas
    async function loadDowntimeAnalysis() {
        const { startDate, endDate, machine, shift } = currentAnalysisFilters;
        console.log('[TRACE][loadDowntimeAnalysis] fetching data', { startDate, endDate, machine, shift });
        
        const downtimeData = await getFilteredData('downtime', startDate, endDate, machine, shift);

        console.log('[TRACE][loadDowntimeAnalysis] dataset received', { downtimeCount: downtimeData.length });
        
        const totalDowntime = downtimeData.reduce((sum, item) => sum + (item.duration || 0), 0);
        const downtimeCount = downtimeData.length;
        const avgDowntime = downtimeCount > 0 ? (totalDowntime / downtimeCount) : 0;
        
        // Calcular MTBF (Mean Time Between Failures)
        const hoursInPeriod = calculateHoursInPeriod(startDate, endDate);
        const mtbf = downtimeCount > 0 ? (hoursInPeriod / downtimeCount) : 0;

        // Atualizar interface
        document.getElementById('total-downtime').textContent = `${(totalDowntime / 60).toFixed(1)}h`;
        document.getElementById('downtime-count').textContent = downtimeCount.toString();
        document.getElementById('avg-downtime').textContent = `${avgDowntime.toFixed(0)}min`;
        document.getElementById('mtbf-value').textContent = `${mtbf.toFixed(1)}h`;

        // Gerar gráficos
        await generateDowntimeReasonsChart(downtimeData);
        await generateDowntimeByMachineChart(downtimeData);
        await generateDowntimeTimelineChart(downtimeData);
    }

    // Função para carregar análise comparativa
    async function loadComparativeAnalysis() {
        console.log('[TRACE][loadComparativeAnalysis] Carregando view comparativa');
        // A view comparativa é carregada sob demanda quando o usuário clica em "Gerar Comparação"
        // Não precisa carregar dados automaticamente
        
        // Limpar gráfico anterior se existir
        const ctx = document.getElementById('comparison-chart');
        if (ctx) {
            clearNoDataMessage('comparison-chart');
            destroyChart('comparison-chart');
        }
        
        // Mostrar mensagem inicial
        showNoDataMessage('comparison-chart', 'Selecione os filtros e clique em "Gerar Comparação"');
    }

    // Função para gerar comparação
    async function generateComparison() {
        const comparisonType = document.getElementById('comparison-type').value;
        const metric = document.getElementById('comparison-metric').value;
        const { startDate, endDate } = currentAnalysisFilters;
        
        let comparisonData = [];
        
        switch (comparisonType) {
            case 'machines':
                comparisonData = await compareByMachines(metric, startDate, endDate);
                break;
            case 'shifts':
                comparisonData = await compareByShifts(metric, startDate, endDate);
                break;
            case 'periods':
                comparisonData = await compareByPeriods(metric);
                break;
            case 'products':
                comparisonData = await compareByProducts(metric, startDate, endDate);
                break;
        }

        // Gerar gráfico de comparação
        await generateComparisonChart(comparisonData, metric);
        generateComparisonRanking(comparisonData);
        generateComparisonStats(comparisonData);
    }

    // Funções auxiliares para análise
    
    // Função de diagnóstico para verificar dados no Firestore
    async function diagnosticFirestoreData() {
        console.log('🔍 [DIAGNOSTIC] Iniciando diagnóstico de dados do Firestore...');
        
        try {
            // Verificar production_entries
            const prodSnapshot = await db.collection('production_entries').limit(5).get();
            console.log('🔍 [DIAGNOSTIC] production_entries:', {
                size: prodSnapshot.size,
                samples: prodSnapshot.docs.map(d => ({
                    id: d.id,
                    data: d.data().data,
                    machine: d.data().machine,
                    produzido: d.data().produzido,
                    turno: d.data().turno
                }))
            });
            
            // Verificar downtime_entries
            const downtimeSnapshot = await db.collection('downtime_entries').limit(5).get();
            console.log('🔍 [DIAGNOSTIC] downtime_entries:', {
                size: downtimeSnapshot.size,
                samples: downtimeSnapshot.docs.map(d => ({
                    id: d.id,
                    date: d.data().date,
                    machine: d.data().machine,
                    duration: d.data().duration,
                    reason: d.data().reason
                }))
            });
            
            // Verificar planning
            const planningSnapshot = await db.collection('planning').limit(5).get();
            console.log('🔍 [DIAGNOSTIC] planning:', {
                size: planningSnapshot.size,
                samples: planningSnapshot.docs.map(d => ({
                    id: d.id,
                    date: d.data().date,
                    machine: d.data().machine,
                    mp: d.data().mp
                }))
            });
            
        } catch (error) {
            console.error('🔍 [DIAGNOSTIC] Erro ao buscar dados:', error);
        }
    }

    // Função para testar todos os gráficos
    async function testAllCharts() {
        console.log('🧪 [TEST] Iniciando teste de todos os gráficos...');
        
        const chartTests = [
            { name: 'OEE Distribution', canvasId: 'oee-distribution-chart', view: 'overview' },
            { name: 'OEE Trend', canvasId: 'oee-trend-overview', view: 'overview' },
            { name: 'Hourly Production', canvasId: 'hourly-production-chart', view: 'production' },
            { name: 'Shift Production', canvasId: 'shift-production-chart', view: 'production' },
            { name: 'OEE Components Timeline', canvasId: 'oee-components-timeline', view: 'efficiency' },
            { name: 'Losses Pareto', canvasId: 'losses-pareto-chart', view: 'losses' },
            { name: 'Losses by Machine', canvasId: 'losses-by-machine-chart', view: 'losses' },
            { name: 'Losses by Material', canvasId: 'losses-by-material-chart', view: 'losses' },
            { name: 'Losses Trend', canvasId: 'losses-trend-chart', view: 'losses' },
            { name: 'Downtime Reasons', canvasId: 'downtime-reasons-chart', view: 'downtime' },
            { name: 'Downtime by Machine', canvasId: 'downtime-by-machine-chart', view: 'downtime' },
            { name: 'Downtime Timeline', canvasId: 'downtime-timeline-chart', view: 'downtime' },
            { name: 'Comparison', canvasId: 'comparison-chart', view: 'comparative' }
        ];
        
        for (const test of chartTests) {
            const canvas = document.getElementById(test.canvasId);
            const chart = canvas ? Chart.getChart(canvas) : null;
            
            const status = {
                canvasExists: !!canvas,
                chartCreated: !!chart,
                hasData: chart?.data?.datasets?.length > 0 || false,
                view: test.view
            };
            
            console.log(`🧪 [TEST] ${test.name}:`, status);
            
            if (!canvas) {
                console.error(`❌ [TEST] Canvas "${test.canvasId}" não encontrado no DOM`);
            } else if (!chart) {
                console.warn(`⚠️ [TEST] Gráfico "${test.name}" não inicializado (canvas existe mas sem Chart.js)`);
            } else if (!status.hasData) {
                console.warn(`⚠️ [TEST] Gráfico "${test.name}" sem dados`);
            } else {
                console.log(`✅ [TEST] Gráfico "${test.name}" OK`);
            }
        }
        
        console.log('🧪 [TEST] Teste completo');
    }
    
    // Helper para destruir gráficos Chart.js existentes
    function destroyChart(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }
        }
    }
    
    // Helper para mostrar mensagem quando não há dados no gráfico
    function showNoDataMessage(canvasId, message = 'Nenhum dado disponível para o período selecionado') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        // Limpar canvas
        const context = canvas.getContext('2d');
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        // Adicionar mensagem
        const container = canvas.parentElement;
        if (container) {
            let messageDiv = container.querySelector('.no-data-message');
            if (!messageDiv) {
                messageDiv = document.createElement('div');
                messageDiv.className = 'no-data-message absolute inset-0 flex items-center justify-center';
                container.style.position = 'relative';
                container.appendChild(messageDiv);
            }
            messageDiv.innerHTML = `<p class="text-gray-500 text-sm">${message}</p>`;
        }
    }
    
    // Helper para remover mensagem de "sem dados"
    function clearNoDataMessage(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const container = canvas.parentElement;
        if (container) {
            const messageDiv = container.querySelector('.no-data-message');
            if (messageDiv) messageDiv.remove();
        }
    }

    async function getFilteredData(collection, startDate, endDate, machine = 'all', shift = 'all') {
        try {
            console.log('[TRACE][getFilteredData] called', { collection, startDate, endDate, machine, shift });
            
            const normalizeShift = (value) => {
                if (value === undefined || value === null) return null;
                if (typeof value === 'number' && Number.isFinite(value)) return value;
                const match = String(value).match(/(\d+)/);
                return match ? Number(match[1]) : null;
            };
            // FIX: map cada tipo analítico para a coleção real no Firestore e normalizar os campos esperados pela aba de análise
            const collectionConfig = {
                production: {
                    collection: 'production_entries',
                    dateField: 'data',
                    mapper: (id, raw) => {
                        const mappedDate = raw.data || raw.date || '';
                        const primaryTimestamp = raw.timestamp || raw.createdAt || raw.updatedAt;
                        const timestamp = primaryTimestamp?.toDate?.() || null;
                        const timeHint = raw.hora || raw.hour || raw.time || null;
                        const workDay = getWorkDayFromTimestamp(primaryTimestamp) || getWorkDay(mappedDate, timeHint);
                        return {
                            id,
                            date: mappedDate,
                            machine: raw.machine || raw.machineRef || raw.machine_id || null,
                            quantity: Number(raw.produzido ?? raw.quantity ?? 0) || 0,
                            shift: normalizeShift(raw.turno ?? raw.shift),
                            datetime: timestamp ? timestamp.toISOString() : null,
                            mp: raw.mp || '',
                            workDay: workDay || mappedDate,
                            raw
                        };
                    }
                },
                losses: {
                    collection: 'production_entries',
                    dateField: 'data',
                    mapper: (id, raw) => {
                        const dateValue = raw.data || raw.date || '';
                        const primaryTimestamp = raw.timestamp || raw.createdAt || raw.updatedAt;
                        const timeHint = raw.hora || raw.hour || raw.time || null;
                        const workDay = getWorkDayFromTimestamp(primaryTimestamp) || getWorkDay(dateValue, timeHint);
                        return {
                            id,
                            date: dateValue,
                            machine: raw.machine || raw.machineRef || raw.machine_id || null,
                            quantity: Number(raw.refugo_kg ?? raw.quantity ?? 0) || 0,
                            shift: normalizeShift(raw.turno ?? raw.shift),
                            reason: raw.perdas || raw.reason || '',
                            mp: raw.mp || '',
                            mp_type: raw.mp_type || '',
                            workDay: workDay || dateValue,
                            raw
                        };
                    }
                },
                downtime: {
                    collection: 'downtime_entries',
                    dateField: 'date',
                    mapper: (id, raw) => {
                        const startMinutes = raw.startTime ? parseTimeToMinutes(raw.date, raw.startTime) : null;
                        const endMinutes = raw.endTime ? parseTimeToMinutes(raw.date, raw.endTime) : null;
                        let duration = Number(raw.duration ?? raw.duration_min ?? raw.duracao_min ?? 0) || 0;
                        if (!duration && startMinutes !== null && endMinutes !== null) {
                            duration = Math.max(0, endMinutes - startMinutes);
                        }
                        const primaryTimestamp = raw.timestamp || raw.createdAt || raw.updatedAt;
                        const timeHint = raw.startTime || raw.endTime || null;
                        const workDay = getWorkDayFromTimestamp(primaryTimestamp) || getWorkDay(raw.date || '', timeHint);
                        return {
                            id,
                            date: raw.date || '',
                            machine: raw.machine || null,
                            duration,
                            reason: raw.reason || '',
                            shift: normalizeShift(raw.shift ?? raw.turno),
                            startTime: raw.startTime || '',
                            endTime: raw.endTime || '',
                            workDay: workDay || raw.date || '',
                            raw
                        };
                    }
                },
                plan: {
                    collection: 'planning',
                    dateField: 'date',
                    mapper: (id, raw) => ({
                        id,
                        date: raw.date || '',
                        machine: raw.machine || null,
                        quantity: Number(raw.planned_quantity ?? raw.quantity ?? 0) || 0,
                        shift: normalizeShift(raw.shift ?? raw.turno),
                        product: raw.product || '',
                        mp: raw.mp || '',
                        workDay: raw.date || '',
                        raw
                    })
                }
            };

            const config = collectionConfig[collection];
            if (!config) {
                console.warn(`Coleção de análise desconhecida: ${collection}`);
                return [];
            }

            if (!startDate || !endDate) {
                console.warn('[TRACE][getFilteredData] datas inválidas fornecidas', { startDate, endDate });
                return [];
            }

            let query = db.collection(config.collection);
            
            // Buscar um período amplo (do dia anterior ao dia posterior)
            // para capturar dados do turno 3 (23h-7h)
            const startObj = new Date(startDate);
            startObj.setDate(startObj.getDate() - 1);
            const queryStartDate = Number.isNaN(startObj.getTime()) ? null : startObj.toISOString().split('T')[0];
            
            const endObj = new Date(endDate);
            endObj.setDate(endObj.getDate() + 1);
            const queryEndDate = Number.isNaN(endObj.getTime()) ? null : endObj.toISOString().split('T')[0];
            
            console.log('[TRACE][getFilteredData] query setup with expanded date range', { 
                collection: config.collection,
                dateField: config.dateField,
                userStartDate: startDate,
                userEndDate: endDate,
                queryStartDate,
                queryEndDate,
                machine,
                shift
            });
            
            if (queryStartDate && queryEndDate) {
                query = query.where(config.dateField, '>=', queryStartDate).where(config.dateField, '<=', queryEndDate);
            }

            let snapshot = await query.get();

            if (snapshot.empty && queryStartDate && queryEndDate) {
                console.warn('[TRACE][getFilteredData] snapshot vazio com filtro de datas, reconsultando sem faixa para aplicar filtro no cliente');
                snapshot = await db.collection(config.collection).get();
            }
            console.log('[TRACE][getFilteredData] raw snapshot', { 
                collection: config.collection,
                size: snapshot.size,
                empty: snapshot.empty
            });
            
            let data = snapshot.docs.map(doc => config.mapper(doc.id, doc.data()));

            const startWorkDay = startDate || null;
            const endWorkDay = endDate || null;

            data = data.filter(item => {
                const workDay = item.workDay || item.date;
                if (!workDay) return false;
                const meetsStart = !startWorkDay || workDay >= startWorkDay;
                const meetsEnd = !endWorkDay || workDay <= endWorkDay;
                return meetsStart && meetsEnd;
            });

            if (collection === 'losses') {
                data = data.filter(item => item.quantity > 0);
            }

            if (machine !== 'all') {
                data = data.filter(item => item.machine === machine);
            }

            if (shift !== 'all') {
                data = data.filter(item => Number(item.shift || 0) === Number(shift));
            }

            console.log('[TRACE][getFilteredData] returning data', {
                collection,
                count: data.length,
                sample: data.slice(0, 3)
            });
            return data;
        } catch (error) {
            console.error('Erro ao buscar dados filtrados:', error);
            return [];
        }
    }

    function parseTimeToMinutes(dateStr, timeStr) {
        // FIX: utilitário para converter HH:MM em minutos absolutos para cálculos de duração
        if (!dateStr || !timeStr) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
        const date = new Date(`${dateStr}T${timeStr}:00`);
        return Math.floor(date.getTime() / 60000);
    }

    function calculateHoursInPeriod(startDate, endDate) {
        if (!startDate || !endDate) return 0;

        const start = new Date(`${startDate}T07:00:00`);
        let end = new Date(`${endDate}T07:00:00`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return 0;
        }

        if (end <= start) {
            end = new Date(start);
            end.setDate(end.getDate() + 1);
        }

        const diffHours = (end - start) / (1000 * 60 * 60);
        return Math.max(24, diffHours);
    }

    function showAnalysisLoading(show) {
        const loading = document.getElementById('analysis-loading');
        const noData = document.getElementById('analysis-no-data');
        
        if (show) {
            loading.classList.remove('hidden');
            noData.classList.add('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    function showAnalysisError() {
        const loading = document.getElementById('analysis-loading');
        const noData = document.getElementById('analysis-no-data');
        
        loading.classList.add('hidden');
        noData.classList.remove('hidden');
    }

    function loadAnalysisMachines() {
        // Inicializar lista de máquinas com as máquinas disponíveis
        machines = machineList.map(machineId => ({ id: machineId, name: machineId }));
        
        // Carregar lista de máquinas para o filtro
        const machineSelector = document.getElementById('analysis-machine');
        if (machineSelector) {
            machineSelector.innerHTML = '<option value="all">Todas as máquinas</option>';
            machines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = machine.name;
                machineSelector.appendChild(option);
            });
        }
    }

    function setAnalysisDefaultDates() {
    const today = getProductionDateString();
        const startDateInput = document.getElementById('analysis-start-date');
        const endDateInput = document.getElementById('analysis-end-date');
        
        if (startDateInput) startDateInput.value = today;
        if (endDateInput) endDateInput.value = today;
        
        // Configurar filtros padrão
        currentAnalysisFilters = {
            startDate: today,
            endDate: today,
            machine: 'all',
            shift: 'all'
        };
    }

    // Helper: atualiza a aba de análise se ela estiver ativa
    async function refreshAnalysisIfActive() {
        try {
            const currentPage = document.querySelector('.nav-btn.active')?.dataset.page;
            if (currentPage !== 'analise') return;

            const activeView = document.querySelector('.analysis-tab-btn.active')?.getAttribute('data-view') || 'overview';
            console.log('[TRACE][refreshAnalysisIfActive] refreshing analysis view', { activeView, filters: currentAnalysisFilters });
            await loadAnalysisData(activeView);
        } catch (err) {
            console.error('[TRACE][refreshAnalysisIfActive] erro ao refrescar análise', err);
        }
    }

    // Funções para geração de gráficos específicos da análise

    // Gráfico de distribuição OEE por máquina
    async function generateOEEDistributionChart(productionData, lossesData, downtimeData) {
        const ctx = document.getElementById('oee-distribution-chart');
        if (!ctx) return;

        destroyChart('oee-distribution-chart');

        const machines = [...new Set(productionData.map(item => item.machine))].filter(m => m);
        
        if (machines.length === 0) {
            showNoDataMessage('oee-distribution-chart');
            return;
        }
        
        clearNoDataMessage('oee-distribution-chart');
        
        const oeeByMachine = {};

        machines.forEach(machine => {
            const machineProduction = productionData.filter(item => item.machine === machine);
            const machineLosses = lossesData.filter(item => item.machine === machine);
            const machineDowntime = downtimeData.filter(item => item.machine === machine);

            const totalProduced = machineProduction.reduce((sum, item) => sum + item.quantity, 0);
            const totalLosses = machineLosses.reduce((sum, item) => sum + item.quantity, 0);
            const totalDowntime = machineDowntime.reduce((sum, item) => sum + (item.duration || 0), 0);

            // Cálculo simplificado do OEE
            const availability = totalDowntime > 0 ? Math.max(0, 100 - (totalDowntime / 480 * 100)) : 100; // 480 min = 8h
            const quality = totalProduced > 0 ? ((totalProduced - totalLosses) / totalProduced * 100) : 100;
            const performance = 85; // Assumindo 85% de performance média

            oeeByMachine[machine] = (availability * quality * performance) / 10000;
        });

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(oeeByMachine),
                datasets: [{
                    data: Object.values(oeeByMachine),
                    backgroundColor: [
                        '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#F97316'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,

                plugins: {
                    legend: {
                        position: window.innerWidth < 768 ? 'bottom' : 'right',
                        labels: {
                            padding: 10,
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.parsed.toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Gráfico de tendência OEE
    async function generateOEETrendChart(startDate, endDate) {
        const ctx = document.getElementById('oee-trend-overview');
        if (!ctx) return;

        destroyChart('oee-trend-overview');

        // Gerar dados dos últimos 7 dias
        const dates = [];
        const oeeValues = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
            
            // Simular dados OEE para demo
            const oee = 65 + Math.random() * 25; // OEE entre 65% e 90%
            oeeValues.push(oee);
        }

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'OEE %',
                    data: oeeValues,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: window.innerWidth < 768 ? 2 : 4,
                    pointHoverRadius: window.innerWidth < 768 ? 4 : 6
                }]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        beginAtZero: false,
                        min: 50,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            },
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: window.innerWidth < 768 ? 9 : 11
                            },
                            maxRotation: window.innerWidth < 768 ? 45 : 0,
                            minRotation: window.innerWidth < 768 ? 45 : 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        titleFont: {
                            size: window.innerWidth < 768 ? 11 : 13
                        },
                        bodyFont: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                }
            }
        });
    }

    // Geração do ranking de máquinas
    async function generateMachineRanking(machinesData) {
        const rankingContainer = document.getElementById('machine-ranking');
        if (!rankingContainer) return;

        // Simular dados para demo
        const machines = [
            { name: 'Máquina 01', oee: 87.5, status: 'excellent' },
            { name: 'Máquina 02', oee: 82.3, status: 'good' },
            { name: 'Máquina 03', oee: 75.8, status: 'average' },
            { name: 'Máquina 04', oee: 68.2, status: 'poor' }
        ];

        const statusColors = {
            excellent: 'bg-green-500',
            good: 'bg-blue-500',
            average: 'bg-yellow-500',
            poor: 'bg-red-500'
        };

        const html = machines.map((machine, index) => `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-4">
                    <div class="flex items-center justify-center w-8 h-8 ${statusColors[machine.status]} text-white rounded-full font-bold">
                        ${index + 1}
                    </div>
                    <span class="font-semibold">${machine.name}</span>
                </div>
                <div class="text-right">
                    <span class="text-2xl font-bold text-gray-800">${machine.oee.toFixed(1)}%</span>
                    <div class="w-24 h-2 bg-gray-200 rounded-full mt-1">
                        <div class="h-2 ${statusColors[machine.status]} rounded-full" style="width: ${machine.oee}%"></div>
                    </div>
                </div>
            </div>
        `).join('');

        rankingContainer.innerHTML = html;
    }

    // Gráfico de produção por hora
    async function generateHourlyProductionChart(productionData) {
        const ctx = document.getElementById('hourly-production-chart');
        if (!ctx) return;

        destroyChart('hourly-production-chart');

        if (productionData.length === 0) {
            showNoDataMessage('hourly-production-chart');
            return;
        }
        
        clearNoDataMessage('hourly-production-chart');

        const hours = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
        const hourlyData = new Array(24).fill(0);

        // Agrupar produção por hora
        productionData.forEach(item => {
            if (item.datetime) {
                const hour = new Date(item.datetime).getHours();
                hourlyData[hour] += item.quantity;
            }
        });

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [{
                    label: 'Peças',
                    data: hourlyData,
                    backgroundColor: '#3B82F6',
                    borderColor: '#1E40AF',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: window.innerWidth < 768 ? 9 : 11
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: window.innerWidth < 768 ? 8 : 10
                            },
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y} pcs`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Gráfico de produção por turno
    async function generateShiftProductionChart(productionData) {
        const ctx = document.getElementById('shift-production-chart');
        if (!ctx) return;

        destroyChart('shift-production-chart');

        if (productionData.length === 0) {
            showNoDataMessage('shift-production-chart');
            return;
        }
        
        clearNoDataMessage('shift-production-chart');

        const shiftData = [0, 0, 0]; // 1º, 2º, 3º turno
        const shiftLabels = ['1º Turno', '2º Turno', '3º Turno'];

        productionData.forEach(item => {
            if (item.shift) {
                shiftData[item.shift - 1] += item.quantity;
            }
        });

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: shiftLabels,
                datasets: [{
                    label: 'Peças',
                    data: shiftData,
                    backgroundColor: ['#10B981', '#3B82F6', '#F59E0B'],
                    borderColor: ['#047857', '#1E40AF', '#D97706'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: window.innerWidth < 768 ? 9 : 11
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: window.innerWidth < 768 ? 9 : 11
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y} pcs`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Função para atualizar gauge de eficiência
    function updateGauge(canvasId, percentage) {
        console.log(`[GAUGE] Atualizando ${canvasId} com ${percentage}%`);
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`[GAUGE] Canvas "${canvasId}" não encontrado`);
            return;
        }

        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 80;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 12;
        ctx.stroke();

        // Progress arc
        const angle = (percentage / 100) * 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + angle);
        
        // Color based on percentage
        if (percentage >= 80) ctx.strokeStyle = '#10B981';
        else if (percentage >= 60) ctx.strokeStyle = '#F59E0B';
        else ctx.strokeStyle = '#EF4444';
        
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        console.log(`[GAUGE] ${canvasId} atualizado com sucesso`);
    }

    // Gráfico Pareto de perdas
    async function generateLossesParetoChart(lossesData) {
        const ctx = document.getElementById('losses-pareto-chart');
        if (!ctx) return;

        destroyChart('losses-pareto-chart');

        const reasonCounts = {};
        lossesData.forEach(item => {
            reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + item.quantity;
        });

        const sortedReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10

        const labels = sortedReasons.map(item => item[0]);
        const data = sortedReasons.map(item => item[1]);
        
        // Calcular percentual acumulado
        const total = data.reduce((sum, val) => sum + val, 0);
        const cumulativePercent = [];
        let cumulative = 0;
        data.forEach(val => {
            cumulative += val;
            cumulativePercent.push((cumulative / total) * 100);
        });

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    type: 'bar',
                    label: 'Quantidade',
                    data: data,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#EF4444',
                    borderWidth: 1,
                    yAxisID: 'y'
                }, {
                    type: 'line',
                    label: '% Acumulado',
                    data: cumulativePercent,
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 100,
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: window.innerWidth < 768 ? 'bottom' : 'top',
                        labels: {
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12
                            }
                        }
                    }
                }
            }
        });
    }

    // Gerar gráfico de perdas por máquina
    async function generateLossesByMachineChart(lossesData) {
        const ctx = document.getElementById('losses-by-machine-chart');
        if (!ctx) return;

        destroyChart('losses-by-machine-chart');

        if (lossesData.length === 0) {
            showNoDataMessage('losses-by-machine-chart');
            return;
        }
        
        clearNoDataMessage('losses-by-machine-chart');

        const machineLosses = {};
        lossesData.forEach(item => {
            const machine = item.machine || 'Sem máquina';
            machineLosses[machine] = (machineLosses[machine] || 0) + (item.quantity || 0);
        });

        const labels = Object.keys(machineLosses);
        const data = Object.values(machineLosses);

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Perdas (kg)',
                    data: data,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#EF4444',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,

                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    },
                    y: {
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Gerar gráfico de perdas por tipo de matéria-prima
    async function generateLossesByMaterialChart(lossesData) {
        const ctx = document.getElementById('losses-by-material-chart');
        if (!ctx) return;

        destroyChart('losses-by-material-chart');

        if (lossesData.length === 0) {
            showNoDataMessage('losses-by-material-chart', 'Nenhuma perda com tipo de MP registrada');
            return;
        }
        
        clearNoDataMessage('losses-by-material-chart');

        // Agrupar perdas por tipo de MP
        const materialLosses = {};
        lossesData.forEach(item => {
            const mpType = item.mp_type || 'Não especificado';
            materialLosses[mpType] = (materialLosses[mpType] || 0) + (item.quantity || 0);
        });

        const labels = Object.keys(materialLosses);
        const data = Object.values(materialLosses);

        // Se não houver dados com mp_type, mostrar mensagem
        if (labels.length === 0 || (labels.length === 1 && labels[0] === 'Não especificado')) {
            showNoDataMessage('losses-by-material-chart', 'Configure o tipo de MP no planejamento para visualizar esta análise');
            return;
        }

        const isMobile = window.innerWidth < 768;

        // Cores para diferentes tipos de MP
        const colors = [
            'rgba(59, 130, 246, 0.8)',   // Azul
            'rgba(16, 185, 129, 0.8)',   // Verde
            'rgba(245, 158, 11, 0.8)',   // Laranja
            'rgba(239, 68, 68, 0.8)',    // Vermelho
            'rgba(139, 92, 246, 0.8)',   // Roxo
            'rgba(236, 72, 153, 0.8)',   // Rosa
            'rgba(20, 184, 166, 0.8)',   // Teal
            'rgba(251, 191, 36, 0.8)',   // Amarelo
        ];

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Perdas (kg)',
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,

                plugins: {
                    legend: {
                        position: isMobile ? 'bottom' : 'right',
                        labels: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            padding: isMobile ? 8 : 10,
                            boxWidth: isMobile ? 12 : 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value.toFixed(2)} kg (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Gerar gráfico de tendência de perdas
    async function generateLossesTrendChart(lossesData, startDate, endDate) {
        const ctx = document.getElementById('losses-trend-chart');
        if (!ctx) return;

        destroyChart('losses-trend-chart');

        if (lossesData.length === 0) {
            showNoDataMessage('losses-trend-chart');
            return;
        }
        
        clearNoDataMessage('losses-trend-chart');

        // Agrupar perdas por data
        const lossesByDate = {};
        lossesData.forEach(item => {
            const date = item.date || '';
            lossesByDate[date] = (lossesByDate[date] || 0) + (item.quantity || 0);
        });

        // Ordenar datas
        const sortedDates = Object.keys(lossesByDate).sort();
        const labels = sortedDates.map(date => {
            const [year, month, day] = date.split('-');
            return `${day}/${month}`;
        });
        const data = sortedDates.map(date => lossesByDate[date]);

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Perdas (kg)',
                    data: data,
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: isMobile ? 2 : 4,
                    pointHoverRadius: isMobile ? 4 : 6
                }]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: isMobile ? 45 : 0,
                            font: {
                                size: isMobile ? 9 : 11
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Gerar gráfico de paradas por motivo
    async function generateDowntimeReasonsChart(downtimeData) {
        const ctx = document.getElementById('downtime-reasons-chart');
        if (!ctx) return;

        destroyChart('downtime-reasons-chart');

        if (downtimeData.length === 0) {
            showNoDataMessage('downtime-reasons-chart');
            return;
        }
        
        clearNoDataMessage('downtime-reasons-chart');

        const reasonDurations = {};
        downtimeData.forEach(item => {
            const reason = item.reason || 'Sem motivo';
            reasonDurations[reason] = (reasonDurations[reason] || 0) + (item.duration || 0);
        });

        const labels = Object.keys(reasonDurations);
        const data = Object.values(reasonDurations).map(d => (d / 60).toFixed(1)); // Converter para horas

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#EF4444',
                        '#F59E0B',
                        '#10B981',
                        '#3B82F6',
                        '#8B5CF6',
                        '#EC4899',
                        '#14B8A6',
                        '#F97316'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,

                plugins: {
                    legend: {
                        position: isMobile ? 'bottom' : 'right',
                        labels: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            padding: isMobile ? 8 : 10
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.parsed + 'h';
                            }
                        }
                    }
                }
            }
        });
    }

    // Gerar gráfico de paradas por máquina
    async function generateDowntimeByMachineChart(downtimeData) {
        const ctx = document.getElementById('downtime-by-machine-chart');
        if (!ctx) return;

        destroyChart('downtime-by-machine-chart');

        if (downtimeData.length === 0) {
            showNoDataMessage('downtime-by-machine-chart');
            return;
        }
        
        clearNoDataMessage('downtime-by-machine-chart');

        const machineDowntime = {};
        downtimeData.forEach(item => {
            const machine = item.machine || 'Sem máquina';
            machineDowntime[machine] = (machineDowntime[machine] || 0) + (item.duration || 0);
        });

        const labels = Object.keys(machineDowntime);
        const data = Object.values(machineDowntime).map(d => (d / 60).toFixed(1)); // Converter para horas

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Tempo de Parada (h)',
                    data: data,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#EF4444',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            callback: function(value) {
                                return value + 'h';
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Gerar timeline de paradas
    async function generateDowntimeTimelineChart(downtimeData) {
        const ctx = document.getElementById('downtime-timeline-chart');
        if (!ctx) return;

        destroyChart('downtime-timeline-chart');

        if (downtimeData.length === 0) {
            showNoDataMessage('downtime-timeline-chart');
            return;
        }
        
        clearNoDataMessage('downtime-timeline-chart');

        // Limitar aos últimos 20 eventos para visualização
        const recentDowntimes = downtimeData.slice(-20).reverse();
        
        const labels = recentDowntimes.map((item, index) => {
            const date = item.date ? new Date(item.date) : new Date();
            return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${item.machine || 'Máq'}`;
        });
        
        const data = recentDowntimes.map(item => (item.duration || 0));

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Duração (min)',
                    data: data,
                    backgroundColor: recentDowntimes.map(item => {
                        const duration = item.duration || 0;
                        if (duration > 120) return '#EF4444'; // Vermelho para >2h
                        if (duration > 60) return '#F59E0B'; // Amarelo para >1h
                        return '#10B981'; // Verde para <1h
                    }),
                    borderWidth: 1,
                    borderColor: '#fff'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,

                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    },
                    y: {
                        ticks: {
                            font: {
                                size: isMobile ? 8 : 10
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const item = recentDowntimes[context.dataIndex];
                                return [
                                    `Duração: ${context.parsed.x} min`,
                                    `Motivo: ${item.reason || 'Não informado'}`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }

    // Função para calcular OEE detalhado
    async function calculateDetailedOEE(startDate, endDate, machine, shift) {
        try {
            const [productionData, lossesData, downtimeData, planData] = await Promise.all([
                getFilteredData('production', startDate, endDate, machine, 'all'),
                getFilteredData('losses', startDate, endDate, machine, 'all'),
                getFilteredData('downtime', startDate, endDate, machine, 'all'),
                getFilteredData('plan', startDate, endDate, machine, 'all')
            ]);

            const { filtered } = aggregateOeeMetrics(
                productionData,
                lossesData,
                downtimeData,
                planData,
                shift
            );

            return {
                availability: (filtered.disponibilidade * 100),
                performance: (filtered.performance * 100),
                quality: (filtered.qualidade * 100),
                oee: (filtered.oee * 100)
            };
        } catch (error) {
            console.error('Erro ao calcular OEE detalhado:', error);
            return { availability: 0, performance: 0, quality: 0, oee: 0 };
        }
    }

    // Função de comparação por máquinas
    async function compareByMachines(metric, startDate, endDate) {
        const machineIds = machines.map(m => m.id);
        const results = [];

        for (const machineId of machineIds) {
            const data = await getFilteredData('production', startDate, endDate, machineId, 'all');
            const value = data.reduce((sum, item) => sum + item.quantity, 0);
            
            results.push({
                name: machines.find(m => m.id === machineId)?.name || machineId,
                value: value
            });
        }

        return results.sort((a, b) => b.value - a.value);
    }

    // Gerar gráfico de comparação
    async function generateComparisonChart(data, metric) {
        const ctx = document.getElementById('comparison-chart');
        if (!ctx) return;

        destroyChart('comparison-chart');

        if (!data || data.length === 0) {
            showNoDataMessage('comparison-chart');
            return;
        }
        
        clearNoDataMessage('comparison-chart');

        const labels = data.map(item => item.name);
        const values = data.map(item => item.value);

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: metric.toUpperCase(),
                    data: values,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderColor: '#3B82F6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: isMobile ? 45 : 0,
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Gerar ranking de comparação
    function generateComparisonRanking(data) {
        const container = document.getElementById('comparison-ranking');
        if (!container) return;

        const html = data.slice(0, 5).map((item, index) => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 bg-primary-blue text-white rounded-full text-sm flex items-center justify-center font-bold">
                        ${index + 1}
                    </span>
                    <span class="font-medium">${item.name}</span>
                </div>
                <span class="text-lg font-bold text-gray-800">${item.value.toLocaleString()}</span>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    // Gerar estatísticas de comparação
    function generateComparisonStats(data) {
        const container = document.getElementById('comparison-stats');
        if (!container) return;

        const values = data.map(item => item.value);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        const range = max - min;

        const html = `
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600">Maior valor:</span>
                    <span class="font-bold">${max.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Menor valor:</span>
                    <span class="font-bold">${min.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Média:</span>
                    <span class="font-bold">${avg.toFixed(0).toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Amplitude:</span>
                    <span class="font-bold">${range.toLocaleString()}</span>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    // Implementações faltantes para análise completa

    // Gerar timeline de componentes OEE
    async function generateOEEComponentsTimeline(startDate, endDate, machine) {
        const ctx = document.getElementById('oee-components-timeline');
        if (!ctx) return;

        destroyChart('oee-components-timeline');

        // Buscar dados para calcular componentes OEE ao longo do tempo
        const productionData = await getFilteredData('production', startDate, endDate, machine);
        const downtimeData = await getFilteredData('downtime', startDate, endDate, machine);

        if (productionData.length === 0) {
            showNoDataMessage('oee-components-timeline');
            return;
        }
        
        clearNoDataMessage('oee-components-timeline');

        // Agrupar por data
        const dataByDate = {};
        
        productionData.forEach(item => {
            const date = item.date || '';
            if (!dataByDate[date]) {
                dataByDate[date] = {
                    produced: 0,
                    scrap: 0,
                    planned: 0,
                    downtime: 0
                };
            }
            dataByDate[date].produced += item.quantity || 0;
            dataByDate[date].scrap += item.scrap || 0;
            dataByDate[date].planned += item.planned || item.quantity || 0;
        });

        downtimeData.forEach(item => {
            const date = item.date || '';
            if (dataByDate[date]) {
                dataByDate[date].downtime += item.duration || 0;
            }
        });

        // Ordenar datas
        const sortedDates = Object.keys(dataByDate).sort();
        const dates = sortedDates.map(date => {
            const [year, month, day] = date.split('-');
            return `${day}/${month}`;
        });
        
        const availabilityData = [];
        const performanceData = [];
        const qualityData = [];

        sortedDates.forEach(date => {
            const data = dataByDate[date];
            
            // Disponibilidade: tempo disponível / tempo planejado
            const plannedMinutes = 480; // 8 horas
            const availability = Math.max(0, Math.min(100, ((plannedMinutes - data.downtime) / plannedMinutes) * 100));
            
            // Performance: produzido / planejado
            const performance = data.planned > 0 ? Math.min(100, (data.produced / data.planned) * 100) : 100;
            
            // Qualidade: (produzido - refugo) / produzido
            const quality = data.produced > 0 ? ((data.produced - data.scrap) / data.produced) * 100 : 100;
            
            availabilityData.push(availability.toFixed(1));
            performanceData.push(performance.toFixed(1));
            qualityData.push(quality.toFixed(1));
        });

        const isMobile = window.innerWidth < 768;

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Disponibilidade %',
                    data: availabilityData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: isMobile ? 2 : 4,
                    pointHoverRadius: isMobile ? 4 : 6,
                    tension: 0.3
                }, {
                    label: 'Performance %',
                    data: performanceData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: isMobile ? 2 : 4,
                    pointHoverRadius: isMobile ? 4 : 6,
                    tension: 0.3
                }, {
                    label: 'Qualidade %',
                    data: qualityData,
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: isMobile ? 2 : 4,
                    pointHoverRadius: isMobile ? 4 : 6,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        beginAtZero: false,
                        min: 0,
                        max: 100,
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: isMobile ? 45 : 0,
                            font: {
                                size: isMobile ? 9 : 11
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: isMobile ? 'bottom' : 'top',
                        labels: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            padding: isMobile ? 8 : 10
                        }
                    }
                }
            }
        });
    }

    // Gerar mapa de calor OEE
    async function generateOEEHeatmap(startDate, endDate) {
        const container = document.getElementById('oee-heatmap');
        if (!container) return;

        const machineNames = ['Máquina 01', 'Máquina 02', 'Máquina 03', 'Máquina 04'];
        const shifts = ['1º Turno', '2º Turno', '3º Turno'];
        
        let html = `
            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="px-4 py-2 text-left">Máquina / Turno</th>
                            ${shifts.map(shift => `<th class="px-4 py-2 text-center">${shift}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        machineNames.forEach(machine => {
            html += `<tr><td class="px-4 py-2 font-semibold">${machine}</td>`;
            
            shifts.forEach(() => {
                const oee = 60 + Math.random() * 30; // OEE entre 60% e 90%
                let colorClass = '';
                
                if (oee >= 80) colorClass = 'bg-green-500 text-white';
                else if (oee >= 70) colorClass = 'bg-yellow-500 text-white';
                else if (oee >= 60) colorClass = 'bg-orange-500 text-white';
                else colorClass = 'bg-red-500 text-white';
                
                html += `
                    <td class="px-4 py-2 text-center">
                        <div class="heatmap-cell ${colorClass} rounded-lg p-2 m-1 cursor-pointer transition-all hover:scale-110">
                            ${oee.toFixed(1)}%
                        </div>
                    </td>
                `;
            });
            
            html += '</tr>';
        });

        html += `
                    </tbody>
                </table>
            </div>
            <div class="mt-4 flex items-center justify-center gap-4 text-sm">
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 bg-green-500 rounded"></div>
                    <span>≥ 80%</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 bg-yellow-500 rounded"></div>
                    <span>70-79%</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 bg-orange-500 rounded"></div>
                    <span>60-69%</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 bg-red-500 rounded"></div>
                    <span>&lt; 60%</span>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    // Funções de comparação faltantes
    async function compareByShifts(metric, startDate, endDate) {
        const shifts = ['1º Turno', '2º Turno', '3º Turno'];
        const results = [];

        for (let i = 1; i <= 3; i++) {
            const data = await getFilteredData('production', startDate, endDate, 'all', i.toString());
            const value = data.reduce((sum, item) => sum + item.quantity, 0);
            
            results.push({
                name: shifts[i - 1],
                value: value
            });
        }

        return results.sort((a, b) => b.value - a.value);
    }

    async function compareByPeriods(metric) {
        const today = new Date();
        const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        const periods = [
            { name: 'Últimos 7 dias', start: lastWeek, end: today },
            { name: 'Últimos 30 dias', start: lastMonth, end: today },
            { name: 'Este mês', start: new Date(today.getFullYear(), today.getMonth(), 1), end: today }
        ];

        const results = [];

        for (const period of periods) {
            const startDate = period.start.toISOString().split('T')[0];
            const endDate = period.end.toISOString().split('T')[0];
            const data = await getFilteredData('production', startDate, endDate, 'all', 'all');
            const value = data.reduce((sum, item) => sum + item.quantity, 0);
            
            results.push({
                name: period.name,
                value: value
            });
        }

        return results;
    }

    async function compareByProducts(metric, startDate, endDate) {
        const productionData = await getFilteredData('production', startDate, endDate, 'all', 'all');
        const planData = await getFilteredData('plan', startDate, endDate, 'all', 'all');
        
        const productData = {};
        
        // Agrupar por produto da produção
        productionData.forEach(item => {
            const product = item.product || 'Produto Não Informado';
            productData[product] = (productData[product] || 0) + item.quantity;
        });

        const results = Object.entries(productData).map(([name, value]) => ({
            name: name,
            value: value
        }));

        return results.sort((a, b) => b.value - a.value);
    }
        
    // Final da inicialização  
    init();

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
        if (refreshRecentEntriesBtn) refreshRecentEntriesBtn.addEventListener('click', () => loadRecentEntries());
        if (recentEntriesList) recentEntriesList.addEventListener('click', handleRecentEntryAction);
        
        // Event listeners para filtros de lançamentos recentes
        const filterButtons = document.querySelectorAll('.filter-entry-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                applyEntryFilter(filter);
            });
        });
        
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
        if (chartToggleTrendBtn) chartToggleTrendBtn.addEventListener('click', () => toggleDashboardChart('trend'));

        if (confirmModal) {
            document.getElementById('confirm-modal-cancel-btn').addEventListener('click', hideConfirmModal);
            document.getElementById('confirm-modal-ok-btn').addEventListener('click', executeDelete);
        }

        // NOVOS EVENT LISTENERS PARA O SISTEMA DE LANÇAMENTOS POR HORA
        document.addEventListener('input', function(e) {
            if (e.target.classList.contains('peso-bruto-input') || 
                e.target.classList.contains('embalagem-fechada-input')) {
                updateTotalCalculation();
            }
        });

        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('usar-tara-checkbox') || e.target.id === 'use-tara-box') {
                updateTotalCalculation();
            }
        });

        // Event listener para deletar lançamentos por hora
        document.addEventListener('click', async function(e) {
            if (e.target.closest('.delete-hourly-entry')) {
                const button = e.target.closest('.delete-hourly-entry');
                const entryId = button.dataset.id;
                
                try {
                    await db.collection('hourly_production_entries').doc(entryId).delete();
                    button.closest('.hourly-entry').remove();
                    updateTotalCalculation();
                } catch (error) {
                    console.error("Erro ao deletar lançamento:", error);
                    alert("Erro ao deletar lançamento.");
                }
            }
        });
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

        if (page === 'lancamento') loadLaunchPanel();
        if (page === 'planejamento') listenToPlanningChanges(getProductionDateString());
        if (page === 'analise') {
            console.log('📊 Abrindo aba de análise');
            
            // Executar diagnóstico (apenas em desenvolvimento)
            diagnosticFirestoreData();
            
            // Garantir que os filtros estão configurados
            if (!currentAnalysisFilters.startDate || !currentAnalysisFilters.endDate) {
                setAnalysisDefaultDates();
            }
            // Carregar dados da view ativa
            const activeView = document.querySelector('.analysis-tab-btn.active')?.getAttribute('data-view') || 'overview';
            console.log('📊 View ativa:', activeView);
            loadAnalysisData(activeView);
        }

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
        if (view) {
            switchAnalysisView(view);
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
            const productOptions = sortedProducts.map(p => {
                const mpAttr = encodeURIComponent(p.mp ?? '');
                return `<option value="${p.cod}" data-client="${p.client}" data-name="${p.name}" data-cycle="${p.cycle}" data-cavities="${p.cavities}" data-weight="${p.weight}" data-mp="${mpAttr}">
                    ${p.cod} - ${p.name} (${p.client})
                </option>`;
            }).join('');
            productCodSelect.innerHTML = `<option value="">Selecione...</option>${productOptions}`;
        }
    }

    function onPlanningProductCodChange(e) {
        const productCod = e.target.value;
        const selectedOption = e.target.selectedOptions[0];
        const product = productDatabase.find(p => String(p.cod) === String(productCod));
        
        const cycleInput = document.getElementById('budgeted-cycle');
        const cavitiesInput = document.getElementById('mold-cavities');
        const weightInput = document.getElementById('piece-weight');
        const plannedQtyInput = document.getElementById('planned-quantity');
        const productNameDisplay = document.getElementById('product-name-display');
        const mpInput = planningMpInput || document.getElementById('planning-mp');

        if (productCod && selectedOption) {
            const client = selectedOption.dataset.client;
            const name = selectedOption.dataset.name;
            const cycle = parseFloat(selectedOption.dataset.cycle) || 0;
            const cavities = parseInt(selectedOption.dataset.cavities) || 0;
            const weight = parseFloat(selectedOption.dataset.weight) || 0;
            const mp = selectedOption.dataset.mp ? decodeURIComponent(selectedOption.dataset.mp) : (product?.mp || '');

            if (cycleInput) cycleInput.value = cycle;
            if (cavitiesInput) cavitiesInput.value = cavities;
            if (weightInput) weightInput.value = weight;
            if (mpInput) mpInput.value = mp;
            
            // Calcular quantidade planejada (85% de eficiência)
            const plannedQty = cycle > 0 ? Math.floor((86400 / cycle) * cavities * 0.85) : 0;
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
            if (mpInput) mpInput.value = '';
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
            const mpValue = (data.mp || product.mp || '').trim();
            product.mp = mpValue;
            const productCodSelect = document.getElementById('planning-product-cod');
            if (productCodSelect) {
                const optionToUpdate = productCodSelect.querySelector(`option[value="${productCod}"]`);
                if (optionToUpdate) {
                    optionToUpdate.dataset.mp = encodeURIComponent(mpValue);
                }
            }
            const docData = {
                date: data.date,
                machine: data.machine,
                product_cod: product.cod,
                client: product.client,
                product: product.name,
                budgeted_cycle: product.cycle,
                mold_cavities: product.cavities,
                piece_weight: parseFloat(data.piece_weight) || product.weight,
                planned_quantity: parseInt(data.planned_quantity, 10) || 0,
                mp: mpValue,
                mp_type: data.mp_type || '',
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
            if (planningMpInput) planningMpInput.value = '';
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
                if (machineSelector) {
                    machineSelector.machineData = machineSelector.machineData || {};
                    planningItems.forEach(item => {
                        machineSelector.machineData[item.machine] = { id: item.id, ...item };
                    });
                }
                if (selectedMachineData) {
                    const updatedSelected = planningItems.find(item => item.id === selectedMachineData.id);
                    if (updatedSelected) {
                        selectedMachineData = { ...selectedMachineData, ...updatedSelected };
                        if (productName) {
                            productName.textContent = selectedMachineData.product || 'Produto não definido';
                        }
                        if (shiftTarget) {
                            const currentShift = getCurrentShift();
                            const target = selectedMachineData.planned_quantity || 0;
                            shiftTarget.textContent = Math.round(target / 3) || 0;
                        }
                        if (productMp) {
                            productMp.textContent = selectedMachineData.mp ? `MP: ${selectedMachineData.mp}` : 'Matéria-prima não definida';
                        }
                    }
                }
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
                <td class="px-2 py-2 whitespace-nowrap border text-left">${orDash(item.mp)}</td>
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
            const mpLabel = item.mp ? `<p class="text-xs text-gray-500 mt-1">MP: ${item.mp}</p>` : '';

            return `
                <div class="border rounded-lg p-4 shadow-md flex flex-col justify-between bg-white">
                    <div>
                        <h3 class="font-bold text-lg">${item.machine}</h3>
                        <p class="text-sm text-gray-600">${item.product}</p>
                        ${mpLabel}
                        <div class="grid grid-cols-3 gap-2 mt-2">
                           ${statusHtml}
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-4">
                        <button data-id="${item.id}" data-turno="T1" class="setup-btn ${btnClasses[0]} text-white font-bold py-2 px-3 rounded-lg text-sm">1º Turno</button>
                        <button data-id="${item.id}" data-turno="T2" class="setup-btn ${btnClasses[1]} text-white font-bold py-2 px-3 rounded-lg text-sm">2º Turno</button>
                        <button data-id="${item.id}" data-turno="T3" class="setup-btn ${btnClasses[2]} text-white font-bold py-2 px-3 rounded-lg text-sm">3º Turno</button>
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
        
        console.log('[TRACE][showLeaderModal] opening', { docId, turno });

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
                console.log('[TRACE][showLeaderModal] planning data', data);
                leaderModalTitle.textContent = `Lançamento: ${data.machine} - ${turno}`;
                
                document.getElementById('leader-entry-real-cycle').value = data[`real_cycle_${turno.toLowerCase()}`] || '';
                document.getElementById('leader-entry-active-cavities').value = data[`active_cavities_${turno.toLowerCase()}`] || '';
            }
            
        } catch (error) {
            console.error("Erro ao buscar dados do setup: ", error);
        }
        
        leaderModal.classList.remove('hidden');
        console.log('[TRACE][showLeaderModal] modal displayed');
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

        console.log('[TRACE][handleLeaderEntrySubmit] submission data', {
            docId,
            turno,
            realCycle,
            activeCavities
        });

        const planDataToUpdate = {
            [`real_cycle_${turno.toLowerCase()}`]: realCycle,
            [`active_cavities_${turno.toLowerCase()}`]: activeCavities,
        };

        console.log('[TRACE][handleLeaderEntrySubmit] updating planning document', planDataToUpdate);

        try {
            await db.collection('planning').doc(docId).update(planDataToUpdate);

            hideLeaderModal();
            console.log('[TRACE][handleLeaderEntrySubmit] completed successfully');
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
                            <p class="text-xs text-gray-500 mt-1">${item.mp ? `MP: ${item.mp}` : 'MP não definida'}</p>
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
                
                // Configurar informações do produto
                const productWeightInfo = document.getElementById('product-weight-info');
                if (productWeightInfo) {
                    const infoParts = [`Peso da peça: ${planData.piece_weight || 0}g`];
                    if (planData.mp) infoParts.push(`MP: ${planData.mp}`);
                    productWeightInfo.textContent = infoParts.join(' • ');
                }
                
                // Configurar caixa de tara
                const taraCheckbox = document.getElementById('use-tara-box');
                const taraWeightInput = document.getElementById('tara-box-weight');
                const taraInfo = document.getElementById('tara-box-info');
                
                const taraData = taraBoxesDatabase[planData.machine];
                if (taraData) {
                    taraWeightInput.value = taraData.peso;
                    taraInfo.textContent = taraData.descricao;
                }
            } else { throw new Error("Plano não encontrado."); }
            
            // Carregar lançamentos existentes
            await loadHourlyEntries(planId, turno);
            
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
        
        console.log('[TRACE][handleProductionEntrySubmit] submission started', { planId, turno });

        const produzido = parseInt(formData.get('produzido')) || 0;
        const refugoKg = parseFloat(formData.get('refugo')) || 0;
        const borrasKg = parseFloat(formData.get('borras')) || 0;
        const motivoRefugo = formData.get('perdas');

        console.log('[TRACE][handleProductionEntrySubmit] parsed form values', {
            produzido,
            refugoKg,
            borrasKg,
            motivoRefugo
        });

        try {
            // Salvar lançamentos por hora
            await saveHourlyEntries(planId, turno);
            console.log('[TRACE][handleProductionEntrySubmit] hourly entries saved');

            // Salvar registro principal de produção
            const entriesRef = db.collection('production_entries');
            const q = entriesRef.where('planId', '==', planId).where('turno', '==', turno).limit(1);
            const querySnapshot = await q.get();
            const planDoc = await db.collection('planning').doc(planId).get();
            const planData = planDoc.exists ? planDoc.data() : {};
            const planMachine = planData.machine || selectedMachineData?.machine || null;
            const planDate = planData.date || getProductionDateString();
            const planMp = planData.mp || '';
            const planMpType = planData.mp_type || '';

            console.log('[TRACE][handleProductionEntrySubmit] resolved plan info', {
                planMachine,
                planDate,
                planMp,
                planMpType
            });

            const entryPayload = {
                produzido,
                duracao_min: 0,
                refugo_kg: refugoKg,
                borras_kg: borrasKg,
                motivo_refugo: motivoRefugo,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                machine: planMachine, // FIX: vincula a máquina correta para análise e filtros
                mp: planMp,
                mp_type: planMpType
            };

            console.log('[TRACE][handleProductionEntrySubmit] entry payload', entryPayload);
            
            if(querySnapshot.empty){
                console.log('[TRACE][handleProductionEntrySubmit] creating production entry');
                await entriesRef.add({
                    ...entryPayload,
                    planId,
                    turno,
                    data: planDate,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }); // FIX: inclui data/createdAt para uso futuro
            } else {
                console.log('[TRACE][handleProductionEntrySubmit] updating existing production entry');
                await querySnapshot.docs[0].ref.update({
                    ...entryPayload,
                    data: planDate
                });
            }

            if (statusMessage) {
                statusMessage.textContent = 'Lançamentos salvos com sucesso!';
                statusMessage.className = 'text-green-600 text-sm font-semibold h-5 text-center';
            }
            // Atualizar aba de análise se estiver aberta
            await refreshAnalysisIfActive();
            setTimeout(() => {
                hideProductionModal();
                if (statusMessage) statusMessage.textContent = '';
            }, 1500);
        } catch (error) {
            console.error("Erro ao salvar lançamentos: ", error);
            if (statusMessage) {
                statusMessage.textContent = 'Erro ao salvar. Tente novamente.';
                statusMessage.className = 'text-red-600 text-sm font-semibold h-5 text-center';
            }
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Salvar Lançamentos';
        }
    }
    // --- ABA DE LANÇAMENTO INTERATIVO ---
    
    function setupLaunchTab() {
        // Configurar seletor de máquina
        if (machineSelector) {
            populateMachineSelector();
            machineSelector.addEventListener('change', handleMachineSelection);
        }
        
        // Configurar botões de ação
        setupActionButtons();
        
        // Atualizar turno atual
        updateCurrentShift();
        
        // Atualizar turno atual a cada minuto
        setInterval(updateCurrentShift, 60000);
    }
    
    async function populateMachineSelector() {
        if (!machineSelector) return;
        
        try {
            const today = getProductionDateString();
            const planningSnapshot = await db.collection('planning').where('date', '==', today).get();
            const machines = new Set();
            
            planningSnapshot.forEach(doc => {
                machines.add(doc.data().machine);
            });
            
            const sortedMachines = [...machines].sort();
            let options = '<option value="">Selecione uma máquina...</option>';
            
            sortedMachines.forEach(machine => {
                options += `<option value="${machine}">${machine}</option>`;
            });
            
            machineSelector.innerHTML = options;
            
        } catch (error) {
            console.error("Erro ao carregar máquinas: ", error);
            machineSelector.innerHTML = '<option value="">Erro ao carregar máquinas</option>';
        }
    }
    
    async function handleMachineSelection() {
        const selectedMachine = machineSelector.value;
        
        if (!selectedMachine) {
            productionControlPanel.classList.add('hidden');
            selectedMachineData = null;
            return;
        }
        
        try {
            // Carregar dados da máquina selecionada
            const today = getProductionDateString();
            const planningSnapshot = await db.collection('planning')
                .where('date', '==', today)
                .where('machine', '==', selectedMachine)
                .get();
            
            if (!planningSnapshot.empty) {
                const planDoc = planningSnapshot.docs[0];
                selectedMachineData = { id: planDoc.id, ...planDoc.data() };
                
                // Mostrar painel e atualizar informações
                productionControlPanel.classList.remove('hidden');
                updateMachineInfo();
                loadHourlyProductionChart();
                loadTodayStats();
                
            } else {
                alert('Nenhum planejamento encontrado para esta máquina hoje.');
                machineSelector.value = '';
            }
            
        } catch (error) {
            console.error("Erro ao carregar dados da máquina: ", error);
            alert('Erro ao carregar dados da máquina.');
        }
    }
    
    function updateCurrentShift() {
        const now = new Date();
        const hour = now.getHours();
        let currentShift;
        
        if (hour >= 7 && hour < 15) {
            currentShift = 'T1';
        } else if (hour >= 15 && hour < 23) {
            currentShift = 'T2';
        } else {
            currentShift = 'T3';
        }
        
        if (currentShiftDisplay) {
            currentShiftDisplay.textContent = currentShift;
        }
    }
    
    function updateMachineInfo() {
        if (!selectedMachineData) return;
        
        if (machineIcon) machineIcon.textContent = selectedMachineData.machine;
        if (machineName) machineName.textContent = `Máquina ${selectedMachineData.machine}`;
        if (productName) productName.textContent = selectedMachineData.product || 'Produto não definido';
        if (shiftTarget) shiftTarget.textContent = selectedMachineData.planned_quantity || 0;
    }
    
    async function loadHourlyProductionChart() {
        if (!selectedMachineData || !hourlyProductionChart) return;
        
        try {
            const today = getProductionDateString();
            const productionSnapshot = await db.collection('production_entries')
                .where('data', '==', today)
                .where('planId', '==', selectedMachineData.id)
                .get();
            
            // Preparar dados para o gráfico
            const hourlyData = {};
            for (let i = 7; i < 31; i++) {
                const hour = i >= 24 ? i - 24 : i;
                const hourStr = String(hour).padStart(2, '0') + ':00';
                hourlyData[hourStr] = { planned: 0, actual: 0 };
            }
            
            // Calcular produção planejada por hora (meta dividida por 24 horas)
            const hourlyTarget = (selectedMachineData.planned_quantity || 0) / 24;
            
            Object.keys(hourlyData).forEach(hour => {
                hourlyData[hour].planned = hourlyTarget;
            });
            
            // Adicionar dados reais de produção
            productionSnapshot.forEach(doc => {
                const data = doc.data();
                const timestamp = data.timestamp?.toDate();
                if (timestamp) {
                    const hour = String(timestamp.getHours()).padStart(2, '0') + ':00';
                    if (hourlyData[hour]) {
                        hourlyData[hour].actual += data.produzido || 0;
                    }
                }
            });
            
            renderHourlyChart(hourlyData);
            
        } catch (error) {
            console.error("Erro ao carregar dados do gráfico: ", error);
        }
    }
    
    function renderHourlyChart(data) {
        if (hourlyChartInstance) {
            hourlyChartInstance.destroy();
        }
        
        const ctx = hourlyProductionChart.getContext('2d');
        const hours = Object.keys(data);
        const plannedData = hours.map(hour => data[hour].planned);
        const actualData = hours.map(hour => data[hour].actual);
        
        // Calcular produção acumulada
        let plannedCumulative = 0;
        let actualCumulative = 0;
        const plannedCumulativeData = plannedData.map(val => {
            plannedCumulative += val;
            return plannedCumulative;
        });
        const actualCumulativeData = actualData.map(val => {
            actualCumulative += val;
            return actualCumulative;
        });
        
        hourlyChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hours,
                datasets: [
                    {
                        label: 'Meta Acumulada',
                        data: plannedCumulativeData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3
                    },
                    {
                        label: 'Produção Acumulada',
                        data: actualCumulativeData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,

                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Quantidade de Peças'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Hora'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    }
    
    async function loadTodayStats() {
        if (!selectedMachineData) return;
        
        try {
            const today = getProductionDateString();
            
            // Carregar produção do dia
            const productionSnapshot = await db.collection('production_entries')
                .where('data', '==', today)
                .where('planId', '==', selectedMachineData.id)
                .get();
            
            let totalProduced = 0;
            let totalLosses = 0;
            
            productionSnapshot.forEach(doc => {
                const data = doc.data();
                totalProduced += data.produzido || 0;
                totalLosses += data.refugo_kg || 0;
            });
            
            // Carregar paradas do dia
            const downtimeSnapshot = await db.collection('downtime_entries')
                .where('date', '==', today)
                .where('machine', '==', selectedMachineData.machine)
                .get();
            
            let totalDowntime = 0;
            downtimeSnapshot.forEach(doc => {
                const data = doc.data();
                const start = new Date(`${data.date}T${data.startTime}`);
                const end = new Date(`${data.date}T${data.endTime}`);
                if (end > start) {
                    totalDowntime += Math.round((end - start) / 60000);
                }
            });
            
            // Calcular eficiência
            const target = selectedMachineData.planned_quantity || 0;
            const efficiency = target > 0 ? (totalProduced / target * 100) : 0;
            
            // Atualizar display
            if (producedToday) producedToday.textContent = totalProduced.toLocaleString('pt-BR');
            if (efficiencyToday) efficiencyToday.textContent = efficiency.toFixed(1) + '%';
            if (lossesToday) lossesToday.textContent = totalLosses.toFixed(2);
            if (downtimeToday) downtimeToday.textContent = totalDowntime;
            
        } catch (error) {
            console.error("Erro ao carregar estatísticas: ", error);
        }
    }
    
    function setupActionButtons() {
        // Botão de produção
        const btnProduction = document.getElementById('btn-production');
        if (btnProduction) {
            btnProduction.addEventListener('click', openProductionModal);
        }

        // Botão de perdas
        const btnLosses = document.getElementById('btn-losses');
        if (btnLosses) {
            btnLosses.addEventListener('click', openLossesModal);
        }
        
        // Botão de parada
        const btnDowntime = document.getElementById('btn-downtime');
        if (btnDowntime) {
            btnDowntime.addEventListener('click', toggleDowntime);
        }
        
        // Botão de lançamento manual de parada
        const btnManualDowntime = document.getElementById('btn-manual-downtime');
        if (btnManualDowntime) {
            btnManualDowntime.addEventListener('click', openManualDowntimeModal);
        }
        
        // Setup modals
        setupModals();
    }
    
    function setupModals() {
        // Modal de produção
        const quickProductionModal = document.getElementById('quick-production-modal');
        const quickProductionClose = document.getElementById('quick-production-close');
        const quickProductionCancel = document.getElementById('quick-production-cancel');
        const quickProductionForm = document.getElementById('quick-production-form');
        
        if (quickProductionClose) quickProductionClose.addEventListener('click', () => closeModal('quick-production-modal'));
        if (quickProductionCancel) quickProductionCancel.addEventListener('click', () => closeModal('quick-production-modal'));
        if (quickProductionForm) quickProductionForm.addEventListener('submit', handleProductionSubmit);
        
        // Modal de perdas
        const quickLossesClose = document.getElementById('quick-losses-close');
        const quickLossesCancel = document.getElementById('quick-losses-cancel');
        const quickLossesForm = document.getElementById('quick-losses-form');
        
        if (quickLossesClose) quickLossesClose.addEventListener('click', () => closeModal('quick-losses-modal'));
        if (quickLossesCancel) quickLossesCancel.addEventListener('click', () => closeModal('quick-losses-modal'));
        if (quickLossesForm) quickLossesForm.addEventListener('submit', handleLossesSubmit);
        
        // Modal de parada
        const quickDowntimeClose = document.getElementById('quick-downtime-close');
        const quickDowntimeCancel = document.getElementById('quick-downtime-cancel');
        const quickDowntimeForm = document.getElementById('quick-downtime-form');
        
        if (quickDowntimeClose) quickDowntimeClose.addEventListener('click', () => closeModal('quick-downtime-modal'));
        if (quickDowntimeCancel) quickDowntimeCancel.addEventListener('click', () => closeModal('quick-downtime-modal'));
        if (quickDowntimeForm) quickDowntimeForm.addEventListener('submit', handleDowntimeSubmit);
        
        // Modal de parada manual
        const manualDowntimeClose = document.getElementById('manual-downtime-close');
        const manualDowntimeCancel = document.getElementById('manual-downtime-cancel');
        const manualDowntimeForm = document.getElementById('manual-downtime-form');
        
        if (manualDowntimeClose) manualDowntimeClose.addEventListener('click', () => closeModal('manual-downtime-modal'));
        if (manualDowntimeCancel) manualDowntimeCancel.addEventListener('click', () => closeModal('manual-downtime-modal'));
        if (manualDowntimeForm) manualDowntimeForm.addEventListener('submit', handleManualDowntimeSubmit);
    }
    
    // Funções para abrir/fechar modais
    function openProductionModal() {
        currentEditContext = null;
        if (!selectedMachineData) {
            alert('Selecione uma máquina primeiro.');
            return;
        }
        document.getElementById('quick-production-modal').classList.remove('hidden');
    }
    
    function openLossesModal() {
        currentEditContext = null;
        if (!selectedMachineData) {
            alert('Selecione uma máquina primeiro.');
            return;
        }
        document.getElementById('quick-losses-modal').classList.remove('hidden');
    }
    
    function closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        // Limpar formulários
        const form = document.querySelector(`#${modalId} form`);
        if (form) form.reset();
        if (['quick-production-modal', 'quick-losses-modal', 'quick-downtime-modal'].includes(modalId)) {
            currentEditContext = null;
        }
    }

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('hidden');
    }

    async function uploadEvidencePhoto(file, folder = 'evidences') {
        if (!file) {
            return { url: null, path: null };
        }

        if (!storage) {
            throw new Error('storage-not-configured');
        }

        const baseFolder = folder
            .replace(/^\/+/g, '')
            .replace(/\/+$/g, '')
            .replace(/^\.+/, '')
            .replace(/\\+/g, '/');
        const sanitizedFolder = (baseFolder || 'evidences').replace(/\s+/g, '_');
        const inferredExt = (file.type && file.type.split('/')[1]) || (file.name.split('.').pop() || 'jpg');
        const extension = (inferredExt || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const storagePath = `${sanitizedFolder}/${uniqueSuffix}.${extension}`;
        const metadata = { contentType: file.type || 'image/jpeg' };

        console.log('[TRACE][uploadEvidencePhoto] iniciando upload', { storagePath, contentType: metadata.contentType });

        const snapshot = await storage.ref().child(storagePath).put(file, metadata);
        const downloadURL = await snapshot.ref.getDownloadURL();

        console.log('[TRACE][uploadEvidencePhoto] upload concluído', { storagePath, downloadURL });
        return { url: downloadURL, path: storagePath };
    }

    async function deleteEvidencePhoto(storagePath) {
        if (!storagePath || !storage) {
            return;
        }

        try {
            console.log('[TRACE][deleteEvidencePhoto] removendo arquivo antigo', { storagePath });
            await storage.ref().child(storagePath).delete();
        } catch (error) {
            if (error?.code === 'storage/object-not-found') {
                console.warn('[TRACE][deleteEvidencePhoto] arquivo já inexistente', storagePath);
            } else {
                console.warn('[TRACE][deleteEvidencePhoto] falha ao remover arquivo', { storagePath, error });
            }
        }
    }
    
    // Função para toggle de parada (stop/start)
    function toggleDowntime() {
        if (!selectedMachineData) {
            alert('Selecione uma máquina primeiro.');
            return;
        }
        
        if (machineStatus === 'running') {
            // Parar máquina - registrar início da parada
            startMachineDowntime();
        } else {
            // Retomar máquina - solicitar motivo e finalizar parada
            openDowntimeReasonModal();
        }
    }
    
    // Função para abrir modal de lançamento manual de parada passada
    function openManualDowntimeModal() {
        if (!selectedMachineData) {
            alert('Selecione uma máquina primeiro.');
            return;
        }
        openModal('manual-downtime-modal');
    }
    
    // Função para iniciar parada da máquina
    function startMachineDowntime() {
        const now = new Date();
        currentDowntimeStart = {
            machine: selectedMachineData.machine,
            date: getProductionDateString(),
            startTime: now.toTimeString().substr(0, 5),
            startTimestamp: now
        };
        
        console.log('[TRACE][startMachineDowntime] parada iniciada', currentDowntimeStart);
        
        machineStatus = 'stopped';
        updateMachineStatus();
        startDowntimeTimer();
        
        showNotification('Máquina parada! Clique em START quando retomar.', 'warning');
    }
    
    // Função para abrir modal solicitando motivo da parada ao retomar
    function openDowntimeReasonModal() {
        if (!currentDowntimeStart) {
            console.warn('Nenhuma parada ativa para finalizar.');
            machineStatus = 'running';
            updateMachineStatus();
            return;
        }
        openModal('quick-downtime-modal');
    }
    
    // Handlers dos formulários
    async function handleProductionSubmit(e) {
        e.preventDefault();
        
        console.log('[TRACE][handleProductionSubmit] triggered', {
            selectedMachineData,
            currentEditContext
        });

        const qty = parseInt(document.getElementById('quick-production-qty').value, 10) || 0;
        const weight = parseFloat(document.getElementById('quick-production-weight').value) || 0;
        const obs = (document.getElementById('quick-production-obs').value || '').trim();
        
        console.log('[TRACE][handleProductionSubmit] parsed form values', { qty, weight, obs });

        if (qty <= 0) {
            alert('Por favor, informe uma quantidade válida.');
            return;
        }

        const isEditing = currentEditContext && currentEditContext.type === 'production' && currentEditContext.id;
        const originalData = isEditing ? currentEditContext.original : null;

        console.log('[TRACE][handleProductionSubmit] context info', { isEditing, originalData });

        const fallbackPlan = selectedMachineData ? selectedMachineData.id : originalData?.planId;
        const planId = isEditing ? (originalData?.planId || fallbackPlan) : fallbackPlan;

        console.log('[TRACE][handleProductionSubmit] resolved plan', { fallbackPlan, planId });

        if (!planId) {
            alert('Não foi possível identificar o planejamento associado ao lançamento.');
            return;
        }

        const currentShift = getCurrentShift();
        const turno = isEditing ? (originalData?.turno || currentShift) : currentShift;
        const dataReferencia = isEditing ? (originalData?.data || getProductionDateString()) : getProductionDateString();
        const machineRef = isEditing ? (originalData?.machine || selectedMachineData?.machine) : selectedMachineData?.machine;
        const mpValue = isEditing ? (originalData?.mp || selectedMachineData?.mp || '') : (selectedMachineData?.mp || '');

        const payloadBase = {
            planId,
            data: dataReferencia,
            turno,
            produzido: qty,
            peso_bruto: weight,
            refugo_kg: 0,
            perdas: '',
            observacoes: obs,
            machine: machineRef || null,
            mp: mpValue
        };
        
        console.log('[TRACE][handleProductionSubmit] payloadBase prepared', payloadBase);

        const collectionRef = db.collection('production_entries');
        const successMessage = isEditing ? 'Produção atualizada com sucesso!' : 'Produção registrada com sucesso!';

        try {
            if (isEditing) {
                console.log('[TRACE][handleProductionSubmit] updating existing entry', currentEditContext.id);
                await collectionRef.doc(currentEditContext.id).update({
                    ...payloadBase,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                console.log('[TRACE][handleProductionSubmit] creating new entry');
                await collectionRef.add({
                    ...payloadBase,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            closeModal('quick-production-modal');
            await loadHourlyProductionChart();
            await loadTodayStats();
            await loadRecentEntries(false);
            showNotification(successMessage, 'success');

            console.log('[TRACE][handleProductionSubmit] success path completed');
        } catch (error) {
            console.error('Erro ao registrar produção: ', error);
            alert('Erro ao registrar produção. Tente novamente.');
        }
    }
    
    async function handleLossesSubmit(e) {
        e.preventDefault();
        
        console.log('[TRACE][handleLossesSubmit] triggered', {
            selectedMachineData,
            currentEditContext
        });

        const quantityInput = document.getElementById('quick-losses-qty');
        const weightInput = document.getElementById('quick-losses-weight');
        const quantity = parseInt(quantityInput.value, 10) || 0;
        const weight = parseFloat(weightInput.value) || 0;
        const reason = document.getElementById('quick-losses-reason').value;
        const obs = (document.getElementById('quick-losses-obs').value || '').trim();
        const lossesPhotoInput = document.getElementById('quick-losses-photo');
        const lossesPhotoFile = lossesPhotoInput?.files?.[0] || null;

        console.log('[TRACE][handleLossesSubmit] parsed form values', { quantity, weight, reason, obs });

        if (quantity <= 0 && weight <= 0) {
            alert('Informe a quantidade ou o peso da perda.');
            if (quantityInput) quantityInput.focus();
            else if (weightInput) weightInput.focus();
            return;
        }

        if (!reason) {
            alert('Por favor, selecione o motivo da perda.');
            return;
        }

        // Se só o peso for informado, converter para peças usando peso médio do planejamento
        let refugoQty = quantity;
        if (quantity <= 0 && weight > 0) {
            // Buscar peso médio do planejamento
            let pesoMedio = 0;
            if (selectedMachineData && selectedMachineData.piece_weight) {
                pesoMedio = parseFloat(selectedMachineData.piece_weight) || 0;
            }
            if (!pesoMedio && selectedMachineData && selectedMachineData.weight) {
                pesoMedio = parseFloat(selectedMachineData.weight) || 0;
            }
            if (!pesoMedio && selectedMachineData && selectedMachineData.produto && selectedMachineData.produto.weight) {
                pesoMedio = parseFloat(selectedMachineData.produto.weight) || 0;
            }
            if (pesoMedio > 0) {
                refugoQty = Math.round((weight * 1000) / pesoMedio);
                console.log(`[TRACE][handleLossesSubmit] conversão: ${weight}kg / ${pesoMedio}g = ${refugoQty} peças`);
            } else {
                refugoQty = 0;
                console.warn('[TRACE][handleLossesSubmit] peso médio não encontrado para conversão de peças');
            }
        }

        const isEditing = currentEditContext && currentEditContext.type === 'loss' && currentEditContext.id;
        const originalData = isEditing ? currentEditContext.original : null;

        console.log('[TRACE][handleLossesSubmit] context info', { isEditing, originalData });

        const fallbackPlan = selectedMachineData ? selectedMachineData.id : originalData?.planId;
        const planId = isEditing ? (originalData?.planId || fallbackPlan) : fallbackPlan;

        console.log('[TRACE][handleLossesSubmit] resolved plan', { fallbackPlan, planId });

        if (!planId) {
            alert('Não foi possível identificar o planejamento associado ao lançamento.');
            return;
        }

        let photoUrl = isEditing ? (originalData?.photoUrl || null) : null;
        let photoStoragePath = isEditing ? (originalData?.photoStoragePath || null) : null;

        if (lossesPhotoFile) {
            try {
                const uploadResult = await uploadEvidencePhoto(lossesPhotoFile, `losses/${planId}`);
                if (uploadResult?.url) {
                    if (photoStoragePath && photoStoragePath !== uploadResult.path) {
                        await deleteEvidencePhoto(photoStoragePath);
                    }
                    photoUrl = uploadResult.url;
                    photoStoragePath = uploadResult.path;
                }
            } catch (error) {
                console.error('Erro ao enviar foto da perda:', error);
                if (error?.message === 'storage-not-configured') {
                    alert('Não foi possível salvar a foto porque o armazenamento não está configurado.');
                } else {
                    alert('Erro ao enviar a foto. O registro não foi salvo.');
                }
                return;
            }
        }

        const currentShift = getCurrentShift();
        const turno = isEditing ? (originalData?.turno || currentShift) : currentShift;
        const dataReferencia = isEditing ? (originalData?.data || getProductionDateString()) : getProductionDateString();
        const machineRef = isEditing ? (originalData?.machine || selectedMachineData?.machine) : selectedMachineData?.machine;
        const mpValue = isEditing ? (originalData?.mp || selectedMachineData?.mp || '') : (selectedMachineData?.mp || '');

        const payloadBase = {
            planId,
            data: dataReferencia,
            turno,
            produzido: 0,
            peso_bruto: 0,
            refugo_kg: weight,
            refugo_qty: refugoQty,
            perdas: reason,
            observacoes: obs,
            machine: machineRef || null,
            mp: mpValue,
            photoUrl: photoUrl || null,
            photoStoragePath: photoStoragePath || null
        };

        console.log('[TRACE][handleLossesSubmit] payloadBase prepared', payloadBase);

        const collectionRef = db.collection('production_entries');
        const successMessage = isEditing ? 'Perda atualizada com sucesso!' : 'Perda registrada com sucesso!';

        try {
            if (isEditing) {
                console.log('[TRACE][handleLossesSubmit] updating existing entry', currentEditContext.id);
                await collectionRef.doc(currentEditContext.id).update({
                    ...payloadBase,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                console.log('[TRACE][handleLossesSubmit] creating new entry');
                await collectionRef.add({
                    ...payloadBase,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            closeModal('quick-losses-modal');
            await loadTodayStats();
            await loadHourlyProductionChart();
            await loadRecentEntries(false);
            // Atualizar aba de análise se estiver aberta
            await refreshAnalysisIfActive();
            showNotification(successMessage, 'success');

            console.log('[TRACE][handleLossesSubmit] success path completed');
        } catch (error) {
            console.error('Erro ao registrar perda: ', error);
            alert('Erro ao registrar perda. Tente novamente.');
        }
    }
    
    async function handleDowntimeSubmit(e) {
        e.preventDefault();
        
        console.log('[TRACE][handleDowntimeSubmit] triggered', {
            selectedMachineData,
            currentDowntimeStart,
            machineStatus
        });

        const reason = document.getElementById('quick-downtime-reason').value;
        const obs = (document.getElementById('quick-downtime-obs').value || '').trim();
        const downtimePhotoInput = document.getElementById('quick-downtime-photo');
        const downtimePhotoFile = downtimePhotoInput?.files?.[0] || null;
        
        console.log('[TRACE][handleDowntimeSubmit] parsed form values', { reason, obs });

        if (!reason) {
            alert('Por favor, selecione o motivo da parada.');
            return;
        }

        if (!currentDowntimeStart) {
            alert('Nenhuma parada ativa para finalizar.');
            closeModal('quick-downtime-modal');
            return;
        }
        
        try {
            const now = new Date();
            const endTime = now.toTimeString().substr(0, 5);
            
            let photoUrl = null;
            let photoStoragePath = null;
            if (downtimePhotoFile) {
                try {
                    const folder = `downtime/${currentDowntimeStart.machine || 'geral'}`;
                    const uploadResult = await uploadEvidencePhoto(downtimePhotoFile, folder);
                    photoUrl = uploadResult?.url || null;
                    photoStoragePath = uploadResult?.path || null;
                } catch (error) {
                    console.error('Erro ao enviar foto da parada:', error);
                    if (error?.message === 'storage-not-configured') {
                        alert('Não foi possível salvar a foto porque o armazenamento não está configurado.');
                    } else {
                        alert('Erro ao enviar a foto. O registro não foi salvo.');
                    }
                    return;
                }
            }

            // Calcular duração
            const startMinutes = parseTimeToMinutes(currentDowntimeStart.date, currentDowntimeStart.startTime) || 0;
            const endMinutes = parseTimeToMinutes(currentDowntimeStart.date, endTime) || startMinutes;
            const durationMinutes = Math.max(1, endMinutes - startMinutes);

            const downtimeData = {
                machine: currentDowntimeStart.machine,
                date: currentDowntimeStart.date,
                startTime: currentDowntimeStart.startTime,
                endTime: endTime,
                duration: durationMinutes,
                reason: reason,
                observations: obs,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                photoUrl,
                photoStoragePath
            };

            console.log('[TRACE][handleDowntimeSubmit] persistence payload', downtimeData);
            
            await db.collection('downtime_entries').add(downtimeData);
            
            // Resetar status
            currentDowntimeStart = null;
            machineStatus = 'running';
            updateMachineStatus();
            stopDowntimeTimer();
            
            closeModal('quick-downtime-modal');
            
            // Atualizar dados
            await loadTodayStats();
            await loadRecentEntries(false);
            // Atualizar aba de análise se estiver aberta
            await refreshAnalysisIfActive();
            
            // Mostrar sucesso
            showNotification('Parada finalizada e registrada com sucesso!', 'success');

            console.log('[TRACE][handleDowntimeSubmit] success path completed');
            
        } catch (error) {
            console.error("Erro ao registrar parada: ", error);
            alert('Erro ao registrar parada. Tente novamente.');
        }
    }
    
    // Função para lançamento manual de parada passada
    async function handleManualDowntimeSubmit(e) {
        e.preventDefault();
        
        console.log('[TRACE][handleManualDowntimeSubmit] triggered', { selectedMachineData });

        const startTime = document.getElementById('manual-downtime-start').value;
        const endTime = document.getElementById('manual-downtime-end').value;
        const reason = document.getElementById('manual-downtime-reason').value;
        const obs = (document.getElementById('manual-downtime-obs').value || '').trim();
        const manualDowntimePhotoInput = document.getElementById('manual-downtime-photo');
        const manualDowntimePhotoFile = manualDowntimePhotoInput?.files?.[0] || null;
        
        console.log('[TRACE][handleManualDowntimeSubmit] parsed form values', { startTime, endTime, reason, obs });

        if (!startTime || !endTime) {
            alert('Por favor, informe os horários de início e fim da parada.');
            return;
        }

        if (!reason) {
            alert('Por favor, selecione o motivo da parada.');
            return;
        }

        if (!selectedMachineData) {
            alert('Nenhuma máquina selecionada.');
            return;
        }

        // Validar horários
        if (startTime >= endTime) {
            alert('O horário de início deve ser anterior ao horário de fim.');
            return;
        }
        
        try {
            const date = getProductionDateString();
            
            // Calcular duração
            const startMinutes = parseTimeToMinutes(date, startTime) || 0;
            const endMinutes = parseTimeToMinutes(date, endTime) || startMinutes;
            const durationMinutes = Math.max(1, endMinutes - startMinutes);

            let photoUrl = null;
            let photoStoragePath = null;
            if (manualDowntimePhotoFile) {
                try {
                    const folder = `downtime/${selectedMachineData.machine || 'manual'}`;
                    const uploadResult = await uploadEvidencePhoto(manualDowntimePhotoFile, folder);
                    photoUrl = uploadResult?.url || null;
                    photoStoragePath = uploadResult?.path || null;
                } catch (error) {
                    console.error('Erro ao enviar foto da parada manual:', error);
                    if (error?.message === 'storage-not-configured') {
                        alert('Não foi possível salvar a foto porque o armazenamento não está configurado.');
                    } else {
                        alert('Erro ao enviar a foto. O registro não foi salvo.');
                    }
                    return;
                }
            }

            const downtimeData = {
                machine: selectedMachineData.machine,
                date: date,
                startTime: startTime,
                endTime: endTime,
                duration: durationMinutes,
                reason: reason,
                observations: obs,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                photoUrl,
                photoStoragePath
            };

            console.log('[TRACE][handleManualDowntimeSubmit] persistence payload', downtimeData);
            
            await db.collection('downtime_entries').add(downtimeData);
            
            closeModal('manual-downtime-modal');
            
            // Atualizar dados
            await loadTodayStats();
            await loadRecentEntries(false);
            
            // Mostrar sucesso
            showNotification('Parada manual registrada com sucesso!', 'success');

            console.log('[TRACE][handleManualDowntimeSubmit] success path completed');
            
        } catch (error) {
            console.error("Erro ao registrar parada manual: ", error);
            alert('Erro ao registrar parada. Tente novamente.');
        }
    }
    
    async function finishDowntime() {
        try {
            console.log('[TRACE][finishDowntime] invoked', { currentDowntimeStart, machineStatus });
            if (!currentDowntimeStart) {
                console.warn('Nenhuma parada ativa para finalizar.');
                return;
            }

            const now = new Date();
            const endTime = now.toTimeString().substr(0, 5);
            const startMinutes = parseTimeToMinutes(currentDowntimeStart.date, currentDowntimeStart.startTime) || 0;
            const endMinutes = parseTimeToMinutes(currentDowntimeStart.date, endTime) || startMinutes;
            const durationMinutes = Math.max(1, endMinutes - startMinutes);

            const downtimeData = {
                ...currentDowntimeStart,
                endTime,
                duration: durationMinutes, // FIX: persistir a duração calculada para uso na análise
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            console.log('[TRACE][finishDowntime] persistence payload', downtimeData);

            await db.collection('downtime_entries').add(downtimeData);
            
            // Resetar status
            currentDowntimeStart = null;
            machineStatus = 'running';
            updateMachineStatus();
            stopDowntimeTimer();
            
            loadTodayStats();
            await loadRecentEntries(false);
            
            // Mostrar sucesso
            showNotification('Parada finalizada!', 'success');

            console.log('[TRACE][finishDowntime] successfully persisted and reset state');
            
        } catch (error) {
            console.error("Erro ao finalizar parada: ", error);
            alert('Erro ao finalizar parada. Tente novamente.');
        }
    }
    
    // Funções auxiliares
    function getCurrentShift() {
        const now = new Date();
        const hour = now.getHours();
        
        if (hour >= 7 && hour < 15) {
            return 1; // 1º Turno
        } else if (hour >= 15 && hour < 23) {
            return 2; // 2º Turno
        } else {
            return 3; // 3º Turno
        }
    }
    
    function updateMachineStatus() {
        const btnDowntime = document.getElementById('btn-downtime');
        const downtimeIcon = document.getElementById('downtime-icon');
        const downtimeText = document.getElementById('downtime-text');
        const downtimeSubtitle = document.getElementById('downtime-subtitle');
        
        if (machineStatus === 'stopped') {
            // Máquina parada - mostrar botão START (verde)
            btnDowntime.classList.remove('from-red-500', 'to-red-600', 'hover:from-red-600', 'hover:to-red-700');
            btnDowntime.classList.add('from-green-500', 'to-green-600', 'hover:from-green-600', 'hover:to-green-700');
            downtimeIcon.setAttribute('data-lucide', 'play-circle');
            downtimeText.textContent = 'START';
            downtimeSubtitle.textContent = 'Retomar produção';
            downtimeSubtitle.classList.remove('text-red-100');
            downtimeSubtitle.classList.add('text-green-100');
        } else {
            // Máquina rodando - mostrar botão STOP (vermelho)
            btnDowntime.classList.remove('from-green-500', 'to-green-600', 'hover:from-green-600', 'hover:to-green-700');
            btnDowntime.classList.add('from-red-500', 'to-red-600', 'hover:from-red-600', 'hover:to-red-700');
            downtimeIcon.setAttribute('data-lucide', 'pause-circle');
            downtimeText.textContent = 'STOP';
            downtimeSubtitle.textContent = 'Parar máquina';
            downtimeSubtitle.classList.remove('text-green-100');
            downtimeSubtitle.classList.add('text-red-100');
        }
        
        lucide.createIcons();
    }
    
    function startDowntimeTimer() {
        const downtimeTimer = document.getElementById('downtime-timer');
        if (downtimeTimer) {
            downtimeTimer.classList.remove('hidden');
            
            const updateTimer = () => {
                if (!currentDowntimeStart) return;
                const now = new Date();
                const start = new Date(`${currentDowntimeStart.date}T${currentDowntimeStart.startTime}`);
                let diffSec = Math.floor((now - start) / 1000); // segundos
                if (diffSec < 0) diffSec = 0;
                const hours = Math.floor(diffSec / 3600);
                const minutes = Math.floor((diffSec % 3600) / 60);
                const seconds = diffSec % 60;
                downtimeTimer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            };
            updateTimer();
            downtimeTimer.interval = setInterval(updateTimer, 1000);
        }
    }
    
    function stopDowntimeTimer() {
        const downtimeTimer = document.getElementById('downtime-timer');
        if (downtimeTimer) {
            downtimeTimer.classList.add('hidden');
            if (downtimeTimer.interval) {
                clearInterval(downtimeTimer.interval);
            }
        }
    }
    
    function setRecentEntriesState({ loading = false, empty = false }) {
        if (recentEntriesLoading) {
            recentEntriesLoading.classList.toggle('hidden', !loading);
        }
        if (recentEntriesEmpty) {
            recentEntriesEmpty.classList.toggle('hidden', !empty);
        }
        if (recentEntriesList) {
            recentEntriesList.classList.toggle('hidden', empty);
        }
    }

    function updateRecentEntriesEmptyMessage(message) {
        if (recentEntriesEmpty) {
            recentEntriesEmpty.innerHTML = `<p class="text-sm text-gray-500">${message}</p>`;
        }
    }

    function formatEntryTimestamp(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function buildRecentEntryMarkup(entry) {
        const typeConfig = {
            production: { label: 'Produção', badge: 'bg-green-100 text-green-700 border border-green-200' },
            loss: { label: 'Perda', badge: 'bg-orange-100 text-orange-700 border border-orange-200' },
            downtime: { label: 'Parada', badge: 'bg-red-100 text-red-700 border border-red-200' }
        };

        const config = typeConfig[entry.type] || { label: 'Lançamento', badge: 'bg-gray-100 text-gray-600 border border-gray-200' };
        const turnoLabel = entry.data.turno ? `Turno ${entry.data.turno}` : null;
        const timeLabel = formatEntryTimestamp(entry.timestamp);
        const details = [];
        const parseNumber = (value) => {
            if (typeof value === 'number') return value;
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        if (entry.data.mp) {
            details.push(`MP: ${entry.data.mp}`);
        }

        if (entry.type === 'production') {
            const produzido = parseInt(entry.data.produzido ?? entry.data.quantity ?? 0, 10) || 0;
            details.push(`<span class="font-semibold text-gray-800">${produzido} peça(s)</span>`);
            const pesoBruto = parseNumber(entry.data.peso_bruto ?? entry.data.weight ?? 0);
            if (pesoBruto > 0) {
                details.push(`${pesoBruto.toFixed(2)} kg`);
            }
        } else if (entry.type === 'loss') {
            const refugoKg = parseNumber(entry.data.refugo_kg ?? entry.data.weight ?? 0);
            details.push(`<span class="font-semibold text-gray-800">${refugoKg.toFixed(2)} kg</span>`);
            if (entry.data.perdas) {
                details.push(`Motivo: ${entry.data.perdas}`);
            }
        } else if (entry.type === 'downtime') {
            const start = entry.data.startTime ? `${entry.data.startTime}` : '';
            const end = entry.data.endTime ? ` - ${entry.data.endTime}` : '';
            details.push(`Período: ${start}${end}`);
            if (entry.data.reason) {
                details.push(`Motivo: ${entry.data.reason}`);
            }
        }

        const observations = entry.data.observacoes || entry.data.observations || entry.data.notes;
        const canEdit = entry.type === 'production' || entry.type === 'loss';
        const actions = [];

        if (canEdit) {
            actions.push(`
                <button class="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                        data-action="edit" data-entry-id="${entry.id}" data-entry-type="${entry.type}">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                    Editar
                </button>
            `);
        }

        actions.push(`
            <button class="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    data-action="delete" data-entry-id="${entry.id}" data-entry-type="${entry.type}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
                Excluir
            </button>
        `);

        const metaChips = [config.label];
        if (turnoLabel) metaChips.push(turnoLabel);
        if (timeLabel) metaChips.push(timeLabel);

        return `
            <div class="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div class="space-y-2">
                        <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span class="px-2 py-1 rounded-full ${config.badge}">${config.label}</span>
                            ${turnoLabel ? `<span class="px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">${turnoLabel}</span>` : ''}
                            ${timeLabel ? `<span>${timeLabel}</span>` : ''}
                        </div>
                        <div class="text-sm text-gray-700 space-x-2">
                            ${details.join('<span class="text-gray-300">•</span>')}
                        </div>
                        ${observations ? `<div class="text-xs text-gray-500">Obs.: ${observations}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        ${actions.join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function renderRecentEntries(entries) {
        if (!recentEntriesList) return;
        recentEntriesList.innerHTML = entries.map(buildRecentEntryMarkup).join('');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async function loadRecentEntries(showLoading = true) {
        if (!recentEntriesList) return;

        if (showLoading) {
            setRecentEntriesState({ loading: true, empty: false });
        }

        if (!selectedMachineData) {
            recentEntriesCache = new Map();
            if (recentEntriesList) recentEntriesList.innerHTML = '';
            updateRecentEntriesEmptyMessage('Selecione uma máquina para visualizar os lançamentos.');
            setRecentEntriesState({ loading: false, empty: true });
            return;
        }

        try {
            const date = getProductionDateString();
            const planId = selectedMachineData.id;

            const productionSnapshot = await db.collection('production_entries')
                .where('planId', '==', planId)
                .where('data', '==', date)
                .get();

            const entries = [];
            recentEntriesCache = new Map();

            productionSnapshot.forEach(doc => {
                const data = doc.data();
                const type = (data.refugo_kg && data.refugo_kg > 0) || data.perdas ? 'loss' : 'production';
                const timestamp = data.updatedAt?.toDate?.() || data.timestamp?.toDate?.() || data.createdAt?.toDate?.() || (data.datetime ? new Date(data.datetime) : null);

                const entry = {
                    id: doc.id,
                    type,
                    collection: 'production_entries',
                    data,
                    timestamp
                };

                entries.push(entry);
                recentEntriesCache.set(doc.id, entry);
            });

            const downtimeSnapshot = await db.collection('downtime_entries')
                .where('machine', '==', selectedMachineData.machine)
                .where('date', '==', date)
                .get();

            downtimeSnapshot.forEach(doc => {
                const data = doc.data();
                const timestamp = data.createdAt?.toDate?.() || data.timestamp?.toDate?.() || (data.startTime ? new Date(`${data.date}T${data.startTime}`) : null);

                const entry = {
                    id: doc.id,
                    type: 'downtime',
                    collection: 'downtime_entries',
                    data,
                    timestamp
                };

                entries.push(entry);
                recentEntriesCache.set(doc.id, entry);
            });

            entries.sort((a, b) => {
                const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
                const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
                return timeB - timeA;
            });

            // Armazenar todas as entradas para filtro
            allRecentEntries = entries;

            if (!entries.length) {
                updateRecentEntriesEmptyMessage('Ainda não há lançamentos para esta máquina.');
                setRecentEntriesState({ loading: false, empty: true });
            } else {
                applyEntryFilter(currentEntryFilter);
                setRecentEntriesState({ loading: false, empty: false });
            }
        } catch (error) {
            console.error('Erro ao carregar lançamentos recentes: ', error);
            updateRecentEntriesEmptyMessage('Não foi possível carregar os lançamentos. Tente novamente.');
            setRecentEntriesState({ loading: false, empty: true });
        }
    }

    // Função para aplicar filtro de tipo de entrada
    function applyEntryFilter(filter) {
        currentEntryFilter = filter;
        
        let filteredEntries = allRecentEntries;
        
        if (filter !== 'all') {
            filteredEntries = allRecentEntries.filter(entry => entry.type === filter);
        }
        
        if (filteredEntries.length === 0) {
            const filterLabels = {
                all: 'lançamentos',
                production: 'lançamentos de produção',
                downtime: 'paradas',
                loss: 'perdas'
            };
            updateRecentEntriesEmptyMessage(`Não há ${filterLabels[filter]} para exibir.`);
            setRecentEntriesState({ loading: false, empty: true });
        } else {
            renderRecentEntries(filteredEntries);
            setRecentEntriesState({ loading: false, empty: false });
        }
        
        // Atualizar estado visual dos botões de filtro
        updateFilterButtons(filter);
    }
    
    // Função para atualizar estado visual dos botões de filtro
    function updateFilterButtons(activeFilter) {
        const filterButtons = document.querySelectorAll('.filter-entry-btn');
        filterButtons.forEach(btn => {
            const btnFilter = btn.dataset.filter;
            if (btnFilter === activeFilter) {
                btn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
                btn.classList.remove('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-50');
            } else {
                btn.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-sm');
                btn.classList.add('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-50');
            }
        });
    }

    function handleRecentEntryAction(event) {
        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const entryId = actionButton.dataset.entryId;
        const entryType = actionButton.dataset.entryType;

        if (!entryId || !entryType) return;

        if (action === 'edit') {
            openEntryForEditing(entryType, entryId);
        } else if (action === 'delete') {
            const collection = entryType === 'downtime' ? 'downtime_entries' : 'production_entries';
            showConfirmModal(entryId, collection);
        }
    }

    function openEntryForEditing(entryType, entryId) {
        const entry = recentEntriesCache.get(entryId);
        if (!entry) {
            console.warn('Registro para edição não encontrado:', entryId);
            return;
        }

        currentEditContext = {
            type: entryType,
            id: entryId,
            collection: entry.collection,
            original: entry.data
        };

        if (entryType === 'production') {
            document.getElementById('quick-production-qty').value = entry.data.produzido || 0;
            document.getElementById('quick-production-weight').value = entry.data.peso_bruto || 0;
            document.getElementById('quick-production-obs').value = entry.data.observacoes || '';
            openModal('quick-production-modal');
        } else if (entryType === 'loss') {
            document.getElementById('quick-losses-qty').value = entry.data.refugo_qty || entry.data.quantity || 0;
            document.getElementById('quick-losses-weight').value = entry.data.refugo_kg || 0;
            document.getElementById('quick-losses-reason').value = entry.data.perdas || '';
            document.getElementById('quick-losses-obs').value = entry.data.observacoes || '';
            openModal('quick-losses-modal');
        } else {
            alert('Edição deste tipo de lançamento ainda não está disponível.');
        }
    }

    function showNotification(message, type = 'info') {
        console.log('🔔 Mostrando notificação:', { message, type });
        // Criar notificação toast
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
            type === 'success' ? 'bg-green-100 text-green-800 border-green-200' :
            type === 'warning' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
            type === 'error' ? 'bg-red-100 text-red-800 border-red-200' :
            'bg-blue-100 text-blue-800 border-blue-200'
        } border`;
        
        notification.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="${
                    type === 'success' ? 'check-circle' :
                    type === 'warning' ? 'alert-triangle' :
                    type === 'error' ? 'x-circle' : 'info'
                }" class="w-5 h-5"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        lucide.createIcons();
        
        // Remover após 3 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    // Função para carregar o painel de lançamento
    async function loadLaunchPanel() {
        try {
            showLoadingState('launch-panel', true);
            await populateMachineSelector();
            updateCurrentShiftDisplay();
            showLoadingState('launch-panel', false, false);
        } catch (error) {
            console.error("Erro ao carregar painel de lançamento: ", error);
            showLoadingState('launch-panel', false, true);
        }
    }
    
    // Função para popular o seletor de máquinas
    async function populateMachineSelector() {
        if (!machineSelector) return;
        
        try {
            const today = getProductionDateString();
            const planSnapshot = await db.collection('planning').where('date', '==', today).get();
            
            const machines = new Set();
            const machineData = {};
            
            planSnapshot.forEach(doc => {
                const data = doc.data();
                machines.add(data.machine);
                machineData[data.machine] = { id: doc.id, ...data };
            });
            
            const sortedMachines = [...machines].sort();
            
            let options = '<option value="">Selecione uma máquina...</option>';
            sortedMachines.forEach(machine => {
                options += `<option value="${machine}">${machine}</option>`;
            });
            
            machineSelector.innerHTML = options;
            
            // Armazenar dados das máquinas
            machineSelector.machineData = machineData;
            
        } catch (error) {
            console.error("Erro ao carregar máquinas: ", error);
            machineSelector.innerHTML = '<option value="">Erro ao carregar máquinas</option>';
        }
    }
    
    // Função para atualizar display do turno atual
    function updateCurrentShiftDisplay() {
        if (!currentShiftDisplay) return;
        
        const currentShift = getCurrentShift();
        currentShiftDisplay.textContent = currentShift;
    }
    
    // Função para quando uma máquina é selecionada
    async function onMachineSelected(machine) {
        if (!machine || !machineSelector.machineData) {
            productionControlPanel.classList.add('hidden');
            selectedMachineData = null;
            if (recentEntriesList) {
                recentEntriesList.innerHTML = '';
            }
            updateRecentEntriesEmptyMessage('Selecione uma máquina para visualizar os lançamentos.');
            setRecentEntriesState({ loading: false, empty: true });
            if (productMp) productMp.textContent = 'Matéria-prima não definida';
            return;
        }
        
        selectedMachineData = machineSelector.machineData[machine];
        
        // Atualizar informações da máquina
        if (machineIcon) machineIcon.textContent = machine;
        if (machineName) machineName.textContent = `Máquina ${machine}`;
        if (productName) productName.textContent = selectedMachineData.product || 'Produto não definido';
        if (productMp) {
            productMp.textContent = selectedMachineData.mp ? `MP: ${selectedMachineData.mp}` : 'Matéria-prima não definida';
        }
        if (shiftTarget) {
            const currentShift = getCurrentShift();
            const target = selectedMachineData.planned_quantity || 0;
            shiftTarget.textContent = Math.round(target / 3); // Dividir por 3 turnos
        }
        
        // Mostrar painel
        productionControlPanel.classList.remove('hidden');
        
        // Carregar dados
        await loadHourlyProductionChart();
        await loadTodayStats();
        await loadRecentEntries(false);
        
        // Reset machine status
        machineStatus = 'running';
        updateMachineStatus();
    }
    
    // Função para carregar gráfico de produção por hora
    async function loadHourlyProductionChart() {
        if (!hourlyProductionChart || !selectedMachineData) return;
        
        try {
            const today = getProductionDateString();
            
            // Buscar dados de produção
            const prodSnapshot = await db.collection('production_entries')
                .where('planId', '==', selectedMachineData.id)
                .where('data', '==', today)
                .get();
            
            const productions = prodSnapshot.docs.map(doc => doc.data());
            
            // Preparar dados por hora (7:00 às 6:59)
            const hourlyData = {};
            for (let i = 7; i < 24; i++) {
                const hour = `${String(i).padStart(2, '0')}:00`;
                hourlyData[hour] = 0;
            }
            for (let i = 0; i < 7; i++) {
                const hour = `${String(i).padStart(2, '0')}:00`;
                hourlyData[hour] = 0;
            }
            
            // Agregar produção por hora
            productions.forEach(prod => {
                if (prod.timestamp) {
                    const prodDate = prod.timestamp.toDate();
                    const hour = `${String(prodDate.getHours()).padStart(2, '0')}:00`;
                    if (hourlyData[hour] !== undefined) {
                        hourlyData[hour] += prod.produzido || 0;
                    }
                }
            });
            
            // Ordenar horas (7:00 primeiro, depois sequencial)
            const sortedHours = Object.keys(hourlyData).sort((a, b) => {
                const hourA = parseInt(a.split(':')[0]);
                const hourB = parseInt(b.split(':')[0]);
                if (hourA >= 7 && hourB < 7) return -1;
                if (hourA < 7 && hourB >= 7) return 1;
                return hourA - hourB;
            });
            
            // Dados acumulados
            let cumulativeProduced = 0;
            const cumulativeData = sortedHours.map(hour => {
                cumulativeProduced += hourlyData[hour];
                return cumulativeProduced;
            });
            
            // Meta acumulada (distribuída uniformemente)
            const totalTarget = selectedMachineData.planned_quantity || 0;
            const hourlyTarget = totalTarget / 24;
            let cumulativeTarget = 0;
            const targetData = sortedHours.map(() => {
                cumulativeTarget += hourlyTarget;
                return cumulativeTarget;
            });
            
            // Renderizar gráfico
            if (hourlyChartInstance) {
                hourlyChartInstance.destroy();
            }
            
            const ctx = hourlyProductionChart.getContext('2d');
            hourlyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: sortedHours,
                    datasets: [
                        {
                            label: 'Meta Acumulada',
                            data: targetData,
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.1
                        },
                        {
                            label: 'Produção Acumulada',
                            data: cumulativeData,
                            borderColor: '#22c55e',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            fill: true,
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
    
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Quantidade (peças)'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Hora'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    }
                }
            });
            
        } catch (error) {
            console.error("Erro ao carregar gráfico de produção: ", error);
        }
    }
    
    // Função para carregar estatísticas do dia
    async function loadTodayStats() {
        if (!selectedMachineData) return;
        
        try {
            const today = getProductionDateString();
            
            // Buscar dados de produção
            const prodSnapshot = await db.collection('production_entries')
                .where('planId', '==', selectedMachineData.id)
                .where('data', '==', today)
                .get();
            
            const productions = prodSnapshot.docs.map(doc => doc.data());
            
            // Buscar dados de paradas
            const downtimeSnapshot = await db.collection('downtime_entries')
                .where('machine', '==', selectedMachineData.machine)
                .where('date', '==', today)
                .get();
            
            const downtimes = downtimeSnapshot.docs.map(doc => doc.data());
            
            // Calcular totais
            const totalProduced = productions.reduce((sum, prod) => sum + (prod.produzido || 0), 0);
            const totalLosses = productions.reduce((sum, prod) => sum + (prod.refugo_kg || 0), 0);
            
            let totalDowntime = 0;
            downtimes.forEach(dt => {
                const start = new Date(`${dt.date}T${dt.startTime}`);
                const end = new Date(`${dt.date}T${dt.endTime}`);
                if (end > start) {
                    totalDowntime += Math.round((end - start) / 60000); // minutos
                }
            });
            
            // Calcular eficiência
            const target = selectedMachineData.planned_quantity || 0;
            const efficiency = target > 0 ? (totalProduced / target * 100) : 0;
            
            // Atualizar displays
            if (producedToday) producedToday.textContent = totalProduced.toLocaleString('pt-BR');
            if (efficiencyToday) efficiencyToday.textContent = `${efficiency.toFixed(1)}%`;
            if (lossesToday) lossesToday.textContent = totalLosses.toFixed(2);
            if (downtimeToday) downtimeToday.textContent = totalDowntime;
            
        } catch (error) {
            console.error("Erro ao carregar estatísticas: ", error);
        }
    }



    // --- ABA DE ANÁLISE: RESUMO ---
    async function loadResumoData(showLoading = true) {
        const date = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
        if (!date) return;

        if (showLoading) showLoadingState('resumo', true);

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
                
                // Salvar histórico de OEE para este turno
                const dateStr = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
                saveOeeHistory(plan.machine, turno, dateStr, oee);
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

    // --- FUNÇÕES PARA OEE EM TEMPO REAL ---
    
    // Função para calcular OEE em tempo real baseado nos dados atuais
    function calculateRealTimeOEE(data) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Determinar turno atual
        let currentShift;
        if (currentHour >= 7 && currentHour < 15) {
            currentShift = 'T1';
        } else if (currentHour >= 15 && currentHour < 23) {
            currentShift = 'T2';
        } else {
            currentShift = 'T3';
        }
        
        // Calcular tempo decorrido no turno atual
        let tempoDecorridoMin;
        if (currentShift === 'T1') {
            tempoDecorridoMin = (currentHour - 7) * 60 + currentMinute;
        } else if (currentShift === 'T2') {
            tempoDecorridoMin = (currentHour - 15) * 60 + currentMinute;
        } else { // T3
            if (currentHour >= 23) {
                tempoDecorridoMin = (currentHour - 23) * 60 + currentMinute;
            } else {
                tempoDecorridoMin = (currentHour + 1) * 60 + currentMinute; // Para horas 0-6
            }
        }
        
        // Limitar o tempo decorrido ao máximo do turno
        tempoDecorridoMin = Math.min(tempoDecorridoMin, 480);
        
        const oeeByShift = {};
        const oeeByMachine = {};
        
        // Agrupar dados por máquina e turno
        const groupedData = {};
        data.forEach(item => {
            const key = `${item.machine}_${item.turno}`;
            if (!groupedData[key]) {
                groupedData[key] = {
                    machine: item.machine,
                    turno: item.turno,
                    produzido: 0,
                    paradas: 0,
                    refugo_pcs: 0,
                    ciclo_real: item.real_cycle_t1 || item.real_cycle_t2 || item.real_cycle_t3 || item.budgeted_cycle,
                    cav_ativas: item.active_cavities_t1 || item.active_cavities_t2 || item.active_cavities_t3 || item.mold_cavities
                };
            }
            
            groupedData[key].produzido += item.produzido || 0;
            groupedData[key].paradas += item.duracao_min || 0;
            
            if (item.piece_weight > 0) {
                groupedData[key].refugo_pcs += Math.round(((item.refugo_kg || 0) * 1000) / item.piece_weight);
            }
        });
        
        // Calcular OEE para cada grupo
        Object.values(groupedData).forEach(group => {
            const tempoParadaMin = group.paradas;
            const oeeCalc = calculateShiftOEE(
                group.produzido,
                tempoParadaMin,
                group.refugo_pcs,
                group.ciclo_real,
                group.cav_ativas
            );
            
            // Ajustar cálculo para tempo real se for o turno atual
            if (group.turno === currentShift) {
                const tempoProgramadoReal = tempoDecorridoMin;
                const tempoProduzindoReal = Math.max(0, tempoProgramadoReal - tempoParadaMin);
                const disponibilidadeReal = tempoProgramadoReal > 0 ? (tempoProduzindoReal / tempoProgramadoReal) : 0;
                
                const producaoTeoricaReal = group.ciclo_real > 0 && group.cav_ativas > 0 ? 
                    (tempoProduzindoReal * 60 / group.ciclo_real) * group.cav_ativas : 0;
                const performanceReal = producaoTeoricaReal > 0 ? (group.produzido / producaoTeoricaReal) : 0;
                
                const totalProduzidoReal = group.produzido + group.refugo_pcs;
                const qualidadeReal = totalProduzidoReal > 0 ? (group.produzido / totalProduzidoReal) : 0;
                
                const oeeReal = disponibilidadeReal * performanceReal * qualidadeReal;
                
                oeeCalc.disponibilidade = isNaN(disponibilidadeReal) || !isFinite(disponibilidadeReal) ? 0 : disponibilidadeReal;
                oeeCalc.performance = isNaN(performanceReal) || !isFinite(performanceReal) ? 0 : performanceReal;
                oeeCalc.qualidade = isNaN(qualidadeReal) || !isFinite(qualidadeReal) ? 0 : qualidadeReal;
                oeeCalc.oee = isNaN(oeeReal) || !isFinite(oeeReal) ? 0 : oeeReal;
                oeeCalc.isRealTime = true;
                oeeCalc.tempoDecorrido = tempoDecorridoMin;
            }
            
            // Armazenar por turno
            if (!oeeByShift[group.turno]) {
                oeeByShift[group.turno] = [];
            }
            oeeByShift[group.turno].push({
                machine: group.machine,
                ...oeeCalc
            });
            
            // Armazenar por máquina
            if (!oeeByMachine[group.machine]) {
                oeeByMachine[group.machine] = {};
            }
            oeeByMachine[group.machine][group.turno] = oeeCalc;
        });
        
        return {
            currentShift,
            tempoDecorridoMin,
            oeeByShift,
            oeeByMachine
        };
    }
    
    // Função para salvar histórico de OEE
    async function saveOeeHistory(machine, turno, data, oeeData) {
        try {
            const historyEntry = {
                machine,
                turno,
                data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                disponibilidade: oeeData.disponibilidade,
                performance: oeeData.performance,
                qualidade: oeeData.qualidade,
                oee: oeeData.oee,
                isRealTime: oeeData.isRealTime || false,
                tempoDecorrido: oeeData.tempoDecorrido || 480
            };
            
            // Usar ID único baseado em máquina, turno e data para evitar duplicatas
            const docId = `${machine}_${turno}_${data}`;
            await db.collection('oee_history').doc(docId).set(historyEntry, { merge: true });
            
        } catch (error) {
            console.error("Erro ao salvar histórico de OEE: ", error);
        }
    }
    
    // Função para carregar histórico de OEE
    async function loadOeeHistory(startDate, endDate, machine = null, turno = null) {
        try {
            let query = db.collection('oee_history')
                .where('data', '>=', startDate)
                .where('data', '<=', endDate)
                .orderBy('data')
                .orderBy('timestamp');
            
            if (machine) {
                query = query.where('machine', '==', machine);
            }
            
            if (turno) {
                query = query.where('turno', '==', turno);
            }
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate()
            }));
            
        } catch (error) {
            console.error("Erro ao carregar histórico de OEE: ", error);
            return [];
        }
    }
    
    // Função para agrupar OEE por períodos (hora, dia, semana)
    function groupOeeByPeriod(oeeHistory, period = 'day') {
        const grouped = {};
        
        oeeHistory.forEach(entry => {
            let key;
            const date = entry.timestamp || new Date(entry.data);
            
            switch (period) {
                case 'hour':
                    key = `${entry.data}_${String(date.getHours()).padStart(2, '0')}:00`;
                    break;
                case 'day':
                    key = entry.data;
                    break;
                case 'week':
                    const startOfWeek = new Date(date);
                    startOfWeek.setDate(date.getDate() - date.getDay());
                    key = startOfWeek.toISOString().split('T')[0];
                    break;
                default:
                    key = entry.data;
            }
            
            if (!grouped[key]) {
                grouped[key] = {
                    period: key,
                    machines: {},
                    shifts: {},
                    overall: {
                        disponibilidade: [],
                        performance: [],
                        qualidade: [],
                        oee: []
                    }
                };
            }
            
            // Agrupar por máquina
            if (!grouped[key].machines[entry.machine]) {
                grouped[key].machines[entry.machine] = {
                    disponibilidade: [],
                    performance: [],
                    qualidade: [],
                    oee: []
                };
            }
            
            // Agrupar por turno
            if (!grouped[key].shifts[entry.turno]) {
                grouped[key].shifts[entry.turno] = {
                    disponibilidade: [],
                    performance: [],
                    qualidade: [],
                    oee: []
                };
            }
            
            // Adicionar valores
            const metrics = ['disponibilidade', 'performance', 'qualidade', 'oee'];
            metrics.forEach(metric => {
                grouped[key].machines[entry.machine][metric].push(entry[metric]);
                grouped[key].shifts[entry.turno][metric].push(entry[metric]);
                grouped[key].overall[metric].push(entry[metric]);
            });
        });
        
        // Calcular médias
        Object.values(grouped).forEach(group => {
            const calculateAverage = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
            
            // Médias por máquina
            Object.values(group.machines).forEach(machine => {
                machine.avgDisponibilidade = calculateAverage(machine.disponibilidade);
                machine.avgPerformance = calculateAverage(machine.performance);
                machine.avgQualidade = calculateAverage(machine.qualidade);
                machine.avgOee = calculateAverage(machine.oee);
            });
            
            // Médias por turno
            Object.values(group.shifts).forEach(shift => {
                shift.avgDisponibilidade = calculateAverage(shift.disponibilidade);
                shift.avgPerformance = calculateAverage(shift.performance);
                shift.avgQualidade = calculateAverage(shift.qualidade);
                shift.avgOee = calculateAverage(shift.oee);
            });
            
            // Médias gerais
            group.overall.avgDisponibilidade = calculateAverage(group.overall.disponibilidade);
            group.overall.avgPerformance = calculateAverage(group.overall.performance);
            group.overall.avgQualidade = calculateAverage(group.overall.qualidade);
            group.overall.avgOee = calculateAverage(group.overall.oee);
        });
        
        return grouped;
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
        
        const formatPercent = (val, isRealTime = false) => {
            const colorClass = val < 0.7 ? 'text-status-error' : val < 0.85 ? 'text-status-warning' : 'text-status-success';
            const realtimeIndicator = isRealTime ? ' ⚡' : '';
            return `<span class="${colorClass}" title="${isRealTime ? 'OEE em Tempo Real' : 'OEE Calculado'}">${(val * 100).toFixed(1)}%${realtimeIndicator}</span>`;
        };
        
        const date = resumoDateSelector ? resumoDateSelector.value : getProductionDateString();
        const today = getProductionDateString();
        const isToday = date === today;
        
        // Se for hoje, calcular OEE em tempo real para cada item
        let realTimeData = {};
        if (isToday) {
            data.forEach(async (item) => {
                const combinedData = [{
                    machine: item.machine,
                    turno: 'T1',
                    produzido: item.T1.produzido || 0,
                    duracao_min: item.T1.paradas || 0,
                    refugo_kg: item.T1.refugo_kg || 0,
                    piece_weight: item.piece_weight,
                    real_cycle_t1: item.real_cycle_t1,
                    active_cavities_t1: item.active_cavities_t1,
                    budgeted_cycle: item.budgeted_cycle,
                    mold_cavities: item.mold_cavities
                }];
                
                const realTimeOee = calculateRealTimeOEE(combinedData);
                if (realTimeOee && realTimeOee.oeeByMachine[item.machine]) {
                    realTimeData[item.machine] = realTimeOee.oeeByMachine[item.machine];
                }
            });
        }
        
        const tableHTML = `
             <h3 class="text-lg font-bold mb-4 no-print">
                Relatório de Eficiência - ${date}
                ${isToday ? '<span class="text-sm text-green-600 ml-2">⚡ Dados em Tempo Real Disponíveis</span>' : ''}
             </h3>
             <div class="print-header hidden">
                <h1 class="text-xl font-bold">Hokkaido Synchro - Relatório de Eficiência</h1>
                <p>Data: ${new Date(date.replace(/-/g, '/')).toLocaleDateString('pt-BR')}</p>
                ${isToday ? '<p class="text-sm">⚡ Inclui dados em tempo real</p>' : ''}
            </div>
            <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 class="font-semibold text-blue-800 mb-2">Legenda:</h4>
                <div class="flex flex-wrap gap-4 text-sm">
                    <span class="text-status-success">● ≥85% - Excelente</span>
                    <span class="text-status-warning">● 70-84% - Aceitável</span>
                    <span class="text-status-error">● <70% - Crítico</span>
                    ${isToday ? '<span class="text-green-600">⚡ Tempo Real</span>' : ''}
                </div>
            </div>
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Máquina</th><th rowspan="2" class="px-2 py-2 text-left text-xs font-medium uppercase align-middle">Produto</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase">Turno 1</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 2</th>
                        <th colspan="4" class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Turno 3</th>
                        <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle">OEE Médio</th>
                         <th rowspan="2" class="px-2 py-2 text-center text-xs font-medium uppercase border-l align-middle no-print">Ação</th>
                    </tr>
                    <tr>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                        <th class="px-2 py-2 text-center text-xs font-medium uppercase border-l">Disp.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Perf.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase">Qual.</th><th class="px-2 py-2 text-center text-xs font-medium uppercase font-bold">OEE</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${data.map(item => {
                        // Calcular OEE médio
                        const oeeValues = [item.T1.oee, item.T2.oee, item.T3.oee].filter(v => v > 0);
                        const avgOee = oeeValues.length > 0 ? oeeValues.reduce((a, b) => a + b, 0) / oeeValues.length : 0;
                        
                        // Verificar se há dados em tempo real para esta máquina
                        const machineRealTime = realTimeData[item.machine];
                        const hasRealTime = isToday && machineRealTime;
                        
                        return `
                        <tr class="${hasRealTime ? 'bg-green-50' : ''}">
                            <td class="px-2 py-2 whitespace-nowrap font-medium">${item.machine}</td>
                            <td class="px-2 py-2 whitespace-nowrap text-sm">${item.product}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T1.disponibilidade, hasRealTime && machineRealTime.T1)}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T1.performance, hasRealTime && machineRealTime.T1)}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T1.qualidade, hasRealTime && machineRealTime.T1)}</td>
                            <td class="px-2 py-2 text-center font-bold">${formatPercent(item.T1.oee, hasRealTime && machineRealTime.T1)}</td>
                            <td class="px-2 py-2 text-center border-l">${formatPercent(item.T2.disponibilidade, hasRealTime && machineRealTime.T2)}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T2.performance, hasRealTime && machineRealTime.T2)}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T2.qualidade, hasRealTime && machineRealTime.T2)}</td>
                            <td class="px-2 py-2 text-center font-bold">${formatPercent(item.T2.oee, hasRealTime && machineRealTime.T2)}</td>
                            <td class="px-2 py-2 text-center border-l">${formatPercent(item.T3.disponibilidade, hasRealTime && machineRealTime.T3)}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T3.performance, hasRealTime && machineRealTime.T3)}</td>
                            <td class="px-2 py-2 text-center">${formatPercent(item.T3.qualidade, hasRealTime && machineRealTime.T3)}</td>
                            <td class="px-2 py-2 text-center font-bold">${formatPercent(item.T3.oee, hasRealTime && machineRealTime.T3)}</td>
                            <td class="px-2 py-2 text-center border-l font-bold text-lg">${formatPercent(avgOee, hasRealTime)}</td>
                            <td class="px-2 py-2 text-center border-l no-print">
                                <button data-id="${item.id}" class="delete-resumo-btn text-status-error hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
            ${isToday ? `
            <div class="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p class="text-sm text-green-700">
                    <strong>Nota:</strong> Os valores marcados com ⚡ representam cálculos de OEE em tempo real, 
                    atualizados conforme o progresso do turno atual.
                </p>
            </div>
            ` : ''}`;
        resumoContentContainer.innerHTML = tableHTML;
        lucide.createIcons();
    }

    function handlePrintReport() {
        window.print();
    }

    // --- ABA DE ANÁLISE: DASHBOARD ---
    
    function toggleDashboardChart(view) {
        if (!chartToggleProdBtn || !chartToggleOeeBtn || !chartToggleTrendBtn || 
            !productionChartContainer || !oeeChartContainer || !oeeTrendContainer) return;
        
        chartToggleProdBtn.classList.toggle('active', view === 'prod');
        chartToggleOeeBtn.classList.toggle('active', view === 'oee');
        chartToggleTrendBtn.classList.toggle('active', view === 'trend');
        
        productionChartContainer.classList.toggle('hidden', view !== 'prod');
        oeeChartContainer.classList.toggle('hidden', view !== 'oee');
        oeeTrendContainer.classList.toggle('hidden', view !== 'trend');
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
        
        // Calcular OEE em tempo real
        const realTimeOee = calculateRealTimeOEE(filteredDataForKpis);
        
        // Usar OEE em tempo real se disponível, senão usar cálculo tradicional
        let kpis;
        if (realTimeOee && Object.keys(realTimeOee.oeeByMachine).length > 0) {
            // Calcular médias dos OEEs em tempo real
            const allOeeValues = Object.values(realTimeOee.oeeByMachine)
                .flatMap(machine => Object.values(machine));
            
            if (allOeeValues.length > 0) {
                kpis = {
                    disponibilidade: allOeeValues.reduce((sum, oee) => sum + oee.disponibilidade, 0) / allOeeValues.length,
                    performance: allOeeValues.reduce((sum, oee) => sum + oee.performance, 0) / allOeeValues.length,
                    qualidade: allOeeValues.reduce((sum, oee) => sum + oee.qualidade, 0) / allOeeValues.length,
                    oee: allOeeValues.reduce((sum, oee) => sum + oee.oee, 0) / allOeeValues.length,
                    isRealTime: true,
                    currentShift: realTimeOee.currentShift,
                    tempoDecorrido: realTimeOee.tempoDecorridoMin
                };
            } else {
                kpis = calculateDashboardOEE(filteredDataForKpis);
            }
        } else {
            kpis = calculateDashboardOEE(filteredDataForKpis);
        }
        
        updateKpiCards(kpis);
        
        if (graphFilterMachine) {
            renderProductionTimelineChart(filteredDataForGraphs, graphFilterMachine);
            renderOeeByShiftChart(filteredDataForGraphs, graphFilterMachine);
            renderOeeTrendChart(graphFilterMachine); // Novo gráfico de tendência
        } else {
             if (productionTimelineChartInstance) productionTimelineChartInstance.destroy();
             if (oeeByShiftChartInstance) oeeByShiftChartInstance.destroy();
             if (oeeTrendChartInstance) oeeTrendChartInstance.destroy();
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
        
        if (disponibilidadeEl) {
            const dispValue = (kpis.disponibilidade * 100).toFixed(1) + '%';
            disponibilidadeEl.textContent = dispValue;
            if (kpis.isRealTime) {
                disponibilidadeEl.title = `Tempo Real - Turno ${kpis.currentShift} (${kpis.tempoDecorrido}min)`;
            }
        }
        
        if (performanceEl) {
            const perfValue = (kpis.performance * 100).toFixed(1) + '%';
            performanceEl.textContent = perfValue;
            if (kpis.isRealTime) {
                performanceEl.title = `Tempo Real - Turno ${kpis.currentShift} (${kpis.tempoDecorrido}min)`;
            }
        }
        
        if (qualidadeEl) {
            const qualValue = (kpis.qualidade * 100).toFixed(1) + '%';
            qualidadeEl.textContent = qualValue;
            if (kpis.isRealTime) {
                qualidadeEl.title = `Tempo Real - Turno ${kpis.currentShift} (${kpis.tempoDecorrido}min)`;
            }
        }
        
        if (oeeEl) {
            const oeeValue = (kpis.oee * 100).toFixed(1) + '%';
            oeeEl.textContent = oeeValue;
            if (kpis.isRealTime) {
                oeeEl.title = `Tempo Real - Turno ${kpis.currentShift} (${kpis.tempoDecorrido}min)`;
                oeeEl.style.color = '#059669'; // Verde para indicar tempo real
            } else {
                oeeEl.style.color = '';
            }
        }
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

                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } } },
                plugins: { legend: { display: false } }
            }
        });
    }
    
    async function renderOeeTrendChart(selectedMachine) {
        const ctx = document.getElementById('oeeTrendChart');
        if (!ctx) return;
        
        if (oeeTrendChartInstance) oeeTrendChartInstance.destroy();
        
        if (!selectedMachine || selectedMachine === 'total') {
            return;
        }
        
        try {
            // Carregar histórico de OEE dos últimos 7 dias
            const endDate = endDateSelector.value;
            const startDateObj = new Date(endDate);
            startDateObj.setDate(startDateObj.getDate() - 6);
            const startDate = startDateObj.toISOString().split('T')[0];
            
            const oeeHistory = await loadOeeHistory(startDate, endDate, selectedMachine);
            
            if (oeeHistory.length === 0) {
                return;
            }
            
            // Agrupar por dia e turno
            const groupedByDay = groupOeeByPeriod(oeeHistory, 'day');
            
            // Preparar dados para o gráfico
            const dates = Object.keys(groupedByDay).sort();
            const datasets = [
                {
                    label: 'Turno 1',
                    data: dates.map(date => {
                        const dayData = groupedByDay[date];
                        return dayData.shifts.T1 ? (dayData.shifts.T1.avgOee * 100) : null;
                    }),
                    borderColor: '#4F46E5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Turno 2',
                    data: dates.map(date => {
                        const dayData = groupedByDay[date];
                        return dayData.shifts.T2 ? (dayData.shifts.T2.avgOee * 100) : null;
                    }),
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Turno 3',
                    data: dates.map(date => {
                        const dayData = groupedByDay[date];
                        return dayData.shifts.T3 ? (dayData.shifts.T3.avgOee * 100) : null;
                    }),
                    borderColor: '#0077C2',
                    backgroundColor: 'rgba(0, 119, 194, 0.1)',
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'OEE Médio Diário',
                    data: dates.map(date => {
                        const dayData = groupedByDay[date];
                        return dayData.overall.avgOee * 100;
                    }),
                    borderColor: '#DC2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    tension: 0.3,
                    fill: false
                }
            ];
            
            // Formatear datas para exibição
            const formattedDates = dates.map(date => {
                const dateObj = new Date(date);
                return dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            });
            
            oeeTrendChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: formattedDates,
                    datasets: datasets
                },
                options: {
                    responsive: true,
    
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            title: {
                                display: true,
                                text: 'OEE (%)'
                            },
                            ticks: {
                                callback: value => value + '%'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Data'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top'
                        },
                        title: {
                            display: true,
                            text: `Tendência de OEE - ${selectedMachine} (Últimos 7 dias)`
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + (context.parsed.y || 0).toFixed(1) + '%';
                                }
                            }
                        }
                    },
                    hover: {
                        mode: 'index',
                        intersect: false
                    },
                    elements: {
                        point: {
                            radius: 4,
                            hoverRadius: 6
                        }
                    }
                }
            });
            
        } catch (error) {
            console.error("Erro ao carregar gráfico de tendência de OEE: ", error);
        }
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
    // Função para popular opções dos formulários rápidos
    function populateQuickFormOptions() {
        // Popular motivos de perda
        const lossReasonSelect = document.getElementById('quick-losses-reason');
        if (lossReasonSelect) {
            lossReasonSelect.innerHTML = '<option value="">Selecione o motivo...</option>';
            
            // Grupo PROCESSO
            const processoGroup = document.createElement('optgroup');
            processoGroup.label = 'PROCESSO';
            ["BOLHA", "CHUPAGEM", "CONTAMINAÇÃO", "DEGRADAÇÃO", "EMPENAMENTO", "FALHA", 
             "FIAPO", "FORA DE COR", "INÍCIO/REÍNICIO", "JUNÇÃO", "MANCHAS", 
             "MEDIDA FORA DO ESPECIFICADO", "MOÍDO", "PEÇAS PERDIDAS", "QUEIMA", "REBARBA"].forEach(reason => {
                const option = document.createElement('option');
                option.value = reason;
                option.textContent = reason;
                processoGroup.appendChild(option);
            });
            lossReasonSelect.appendChild(processoGroup);
            
            // Grupo FERRAMENTARIA
            const ferramentariaGroup = document.createElement('optgroup');
            ferramentariaGroup.label = 'FERRAMENTARIA';
            ["DEFORMAÇÃO", "GALHO PRESO", "MARCA D'ÁGUA", "MARCA EXTRATOR", "RISCOS", "SUJIDADE"].forEach(reason => {
                const option = document.createElement('option');
                option.value = reason;
                option.textContent = reason;
                ferramentariaGroup.appendChild(option);
            });
            lossReasonSelect.appendChild(ferramentariaGroup);
            
            // Grupo QUALIDADE
            const qualidadeGroup = document.createElement('optgroup');
            qualidadeGroup.label = 'QUALIDADE';
            const option = document.createElement('option');
            option.value = "INSPEÇÃO DE LINHA";
            option.textContent = "INSPEÇÃO DE LINHA";
            qualidadeGroup.appendChild(option);
            lossReasonSelect.appendChild(qualidadeGroup);
        }
        
        // Popular motivos de parada
        const downtimeReasonSelect = document.getElementById('quick-downtime-reason');
        if (downtimeReasonSelect) {
            downtimeReasonSelect.innerHTML = '<option value="">Selecione o motivo...</option>';
            
            const downtimeReasons = {
                'FERRAMENTARIA': ["CORRETIVA DE MOLDE", "PREVENTIVA DE MOLDE", "TROCA DE VERSÃO"],
                'PROCESSO': ["ABERTURA DE CAVIDADE", "AJUSTE DE PROCESSO", "TRY OUT"],
                'COMPRAS': ["FALTA DE INSUMO PLANEJADA", "FALTA DE INSUMO NÃO PLANEJADA"],
                'PREPARAÇÃO': ["AGUARDANDO PREPARAÇÃO DE MATERIAL"],
                'QUALIDADE': ["AGUARDANDO CLIENTE/FORNECEDOR", "LIBERAÇÃO"],
                'MANUTENÇÃO': ["MANUTENÇÃO CORRETIVA", "MANUTENÇÃO PREVENTIVA"],
                'PRODUÇÃO': ["FALTA DE OPERADOR", "TROCA DE COR"],
                'SETUP': ["INSTALAÇÃO DE MOLDE", "RETIRADA DE MOLDE"],
                'ADMINISTRATIVO': ["FALTA DE ENERGIA"],
                'PCP': ["SEM PROGRAMAÇÃO"],
                'COMERCIAL': ["SEM PEDIDO"]
            };
            
            Object.entries(downtimeReasons).forEach(([groupName, reasons]) => {
                const group = document.createElement('optgroup');
                group.label = groupName;
                reasons.forEach(reason => {
                    const option = document.createElement('option');
                    option.value = reason;
                    option.textContent = reason;
                    group.appendChild(option);
                });
                downtimeReasonSelect.appendChild(group);
            });
        }
    }

    // Função para popular o seletor de máquinas da aba de lançamento
    function populateLaunchMachineSelector() {
        const launchMachineSelector = document.getElementById('machine-selector');
        if (launchMachineSelector) {
            console.log('🔧 Populando seletor de máquinas da aba de lançamento');
            
            launchMachineSelector.innerHTML = '<option value="">Selecione uma máquina...</option>';
            
            machineList.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine;
                option.textContent = machine;
                launchMachineSelector.appendChild(option);
            });
            
            console.log('✅ Seletor de máquinas populado com', machineList.length, 'máquinas');
        } else {
            console.log('❌ Elemento machine-selector não encontrado');
        }
    }

    // Funções de teste Firebase
    async function testFirebaseConnection() {
        try {
            console.log('🔥 Iniciando teste Firebase...');
            
            // Verificar se Firebase está carregado
            if (typeof firebase === 'undefined') {
                console.error('❌ Firebase não está carregado');
                showNotification('Firebase não está carregado', 'error');
                return false;
            }
            
            console.log('✅ Firebase carregado');
            
            // Testar configuração
            const app = firebase.app();
            console.log('✅ App Firebase:', app.name);
            
            // Testar Firestore
            console.log('✅ Firestore conectado');
            
            // Testar escrita simples
            const testData = {
                teste: true,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                data: new Date().toISOString()
            };
            
            console.log('📝 Tentando escrever dados de teste...');
            showNotification('Testando escrita no Firebase...', 'info');
            
            const docRef = await db.collection('test').add(testData);
            console.log('✅ Documento de teste criado:', docRef.id);
            showNotification('Teste de escrita bem-sucedido!', 'success');
            
            // Testar leitura
            console.log('📖 Tentando ler dados de teste...');
            const snapshot = await db.collection('test').limit(1).get();
            console.log('✅ Dados lidos:', snapshot.size, 'documentos');
            
            // Limpar teste
            await docRef.delete();
            console.log('🗑️ Documento de teste removido');
            
            // Testar coleções específicas
            await testCollectionWrite();
            
            showNotification('Todos os testes Firebase concluídos com sucesso!', 'success');
            return true;
            
        } catch (error) {
            console.error('❌ Erro no teste Firebase:', error);
            console.error('Código:', error.code);
            console.error('Mensagem:', error.message);
            showNotification(`Erro Firebase: ${error.message}`, 'error');
            return false;
        }
    }

    // Função para testar escrita em coleções específicas
    async function testCollectionWrite() {
        const collections = ['production', 'losses', 'downtime'];
        
        for (const collectionName of collections) {
            try {
                console.log(`📝 Testando escrita em ${collectionName}...`);
                
                const testDoc = {
                    teste: true,
                    collection: collectionName,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                const docRef = await db.collection(collectionName).add(testDoc);
                console.log(`✅ ${collectionName}: documento criado com ID ${docRef.id}`);
                
                // Limpar
                await docRef.delete();
                console.log(`🗑️ ${collectionName}: documento de teste removido`);
                
            } catch (error) {
                console.error(`❌ Erro em ${collectionName}:`, error.code, error.message);
                showNotification(`Erro em ${collectionName}: ${error.message}`, 'error');
            }
        }
    }
    
    // Adicionar evento do botão de teste Firebase
    const firebaseTestBtn = document.getElementById('firebase-test-btn');
    if (firebaseTestBtn) {
        firebaseTestBtn.addEventListener('click', testFirebaseConnection);
        console.log('✅ Botão de teste Firebase configurado');
    }
});
