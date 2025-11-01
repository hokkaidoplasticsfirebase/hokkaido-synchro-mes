// auth.js - Sistema de Autenticação e Autorização
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.sessionKey = 'synchro_user';
        this.init();
    }

    init() {
        // Verificar se há sessão ativa
        this.loadUserSession();
        
        // Aguardar um pouco para garantir que o sessionStorage foi definido corretamente
        setTimeout(() => {
            const isLoginPage = window.location.pathname.includes('login.html') || window.location.href.includes('login.html');
            
            // Se não houver usuário logado e não estivermos na página de login
            if (!this.currentUser && !isLoginPage) {
                console.log('❌ Nenhuma sessão ativa. Redirecionando para login...');
                this.redirectToLogin();
            }
            
            // Se houver usuário logado e estivermos na página de login
            if (this.currentUser && isLoginPage) {
                console.log('✅ Usuário já logado. Redirecionando para index...');
                this.redirectToIndex();
            }
        }, 100);
    }

    redirectToIndex() {
        window.location.href = 'index.html';
    }

    loadUserSession() {
        // Tentar carregar da localStorage primeiro (remember me)
        let userData = localStorage.getItem(this.sessionKey);
        
        console.log('🔍 [DEBUG] loadUserSession - localStorage:', userData);
        
        // Se não encontrou, tentar sessionStorage
        if (!userData) {
            userData = sessionStorage.getItem(this.sessionKey);
            console.log('🔍 [DEBUG] loadUserSession - sessionStorage:', userData);
        }
        
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
                console.log('✅ [DEBUG] Sessão carregada:', this.currentUser);
                this.validateSession();
            } catch (error) {
                console.error('Erro ao carregar sessão do usuário:', error);
                this.logout();
            }
        } else {
            console.warn('⚠️ [DEBUG] Nenhuma sessão encontrada');
        }
    }

    validateSession() {
        if (!this.currentUser) return false;
        
        // Verificar se a sessão não expirou (24 horas para remember me, 8 horas para sessão normal)
        const loginTime = new Date(this.currentUser.loginTime);
        const now = new Date();
        const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
        
        const maxHours = localStorage.getItem(this.sessionKey) ? 24 : 8;
        
        if (hoursDiff > maxHours) {
            this.logout();
            return false;
        }
        
        return true;
    }

    hasPermission(permission) {
        if (!this.currentUser) return false;
        return this.currentUser.permissions.includes(permission);
    }

    isRole(role) {
        if (!this.currentUser) return false;
        return this.currentUser.role === role;
    }

    getCurrentUser() {
        console.log('🔍 [DEBUG] getCurrentUser() chamado:', this.currentUser);
        return this.currentUser;
    }

    setCurrentUser(user) {
        if (user && typeof user === 'object') {
            console.log('🔍 [DEBUG] setCurrentUser() atualizado:', user);
            this.currentUser = user;
        }
    }

    logout() {
        // Limpar dados de sessão
        localStorage.removeItem(this.sessionKey);
        sessionStorage.removeItem(this.sessionKey);
        this.currentUser = null;
        
        // Redirecionar para login
        this.redirectToLogin();
    }

    redirectToLogin() {
        window.location.href = 'login.html';
    }

    // Verificar se o usuário pode acessar uma aba específica
    canAccessTab(tabName) {
        if (!this.currentUser) return false;
        
        const tabPermissions = {
            planejamento: ['planejamento'],
            ordens: ['planejamento', 'lancamento'],
            lancamento: ['lancamento'],
            analise: ['analise']
        };
        
        const requiredPermissions = tabPermissions[tabName];
        if (!requiredPermissions || requiredPermissions.length === 0) {
            return false;
        }
        
        return requiredPermissions.some(permission => this.hasPermission(permission));
    }

    // Filtrar abas baseado nas permissões do usuário
    filterTabsBasedOnPermissions() {
        if (!this.currentUser) return;
        
        const navButtons = document.querySelectorAll('.nav-btn');
        
        navButtons.forEach(btn => {
            const tabName = btn.getAttribute('data-page');
            
            if (!this.canAccessTab(tabName)) {
                btn.style.display = 'none';
                
                // Se a aba ativa está sendo ocultada, mudar para uma permitida
                if (btn.classList.contains('active')) {
                    btn.classList.remove('active');
                    this.setDefaultActiveTab();
                }
            } else {
                btn.style.display = '';
            }
        });
    }

    setDefaultActiveTab() {
        const navButtons = document.querySelectorAll('.nav-btn');
        
        // Para operadores, sempre mostrar lançamento como ativo
        if (this.isRole('operador')) {
            const lancamentoBtn = document.querySelector('[data-page="lancamento"]');
            const lancamentoPage = document.getElementById('lancamento-page');
            
            if (lancamentoBtn && lancamentoPage) {
                lancamentoBtn.classList.add('active');
                lancamentoPage.classList.remove('hidden');
                
                // Ocultar outras páginas
                document.querySelectorAll('.page-content').forEach(page => {
                    if (page.id !== 'lancamento-page') {
                        page.classList.add('hidden');
                    }
                });
            }
        } else {
            // Para gestores, manter o comportamento padrão (lançamento como página inicial)
            const lancamentoBtn = document.querySelector('[data-page="lancamento"]');
            if (lancamentoBtn) {
                lancamentoBtn.classList.add('active');
            }
        }
    }

    // Atualizar interface com informações do usuário
    updateUserInterface() {
        if (!this.currentUser) return;
        
        // Adicionar informações do usuário no cabeçalho
        this.addUserInfoToHeader();
        
        // Filtrar abas baseado nas permissões
        this.filterTabsBasedOnPermissions();
        
        // Adicionar botão de logout
        this.addLogoutButton();
    }

    addUserInfoToHeader() {
        const header = document.querySelector('header') || document.querySelector('.bg-white.shadow-sm');
        
        if (header && !document.getElementById('user-info')) {
            const userInfo = document.createElement('div');
            userInfo.id = 'user-info';
            userInfo.className = 'flex items-center gap-3 text-sm text-gray-600';
            
            const roleColors = {
                'gestor': 'bg-blue-100 text-blue-800',
                'operador': 'bg-green-100 text-green-800',
                'supervisor': 'bg-purple-100 text-purple-800'
            };
            
            const roleColor = roleColors[this.currentUser.role] || 'bg-gray-100 text-gray-800';
            
            userInfo.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <i class="w-4 h-4" data-lucide="user"></i>
                    </div>
                    <div>
                        <div class="font-medium text-gray-900">${this.currentUser.name}</div>
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-1 rounded-full text-xs ${roleColor} capitalize">
                                ${this.currentUser.role}
                            </span>
                        </div>
                    </div>
                </div>
            `;
            
            // Inserir no final do header
            header.appendChild(userInfo);
            
            // Recriar ícones
            lucide.createIcons();
        }
    }

    addLogoutButton() {
        const userInfo = document.getElementById('user-info');
        
        if (userInfo && !document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.className = 'ml-4 px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors flex items-center gap-1';
            logoutBtn.innerHTML = `
                <i class="w-3 h-3" data-lucide="log-out"></i>
                Sair
            `;
            
            logoutBtn.addEventListener('click', () => {
                if (confirm('Deseja realmente sair do sistema?')) {
                    this.logout();
                }
            });
            
            userInfo.appendChild(logoutBtn);
            
            // Recriar ícones
            lucide.createIcons();
        }
    }

    // Verificar permissões antes de executar ações sensíveis
    checkPermissionForAction(action) {
        const actionPermissions = {
            'create_planning': 'planejamento',
            'edit_planning': 'planejamento',
            'delete_planning': 'planejamento',
            'create_production_order': 'planejamento',
            'add_production': 'lancamento',
            'add_losses': 'lancamento',
            'add_downtime': 'lancamento',
            'add_rework': 'lancamento',
            'view_analysis': 'analise',
            'export_data': 'analise',
            'close_production_order': 'mixed'
        };
        
        const requiredPermission = actionPermissions[action];
        
        if (action === 'close_production_order') {
            const userPerms = this.currentUser?.permissions || [];
            const canClose = userPerms.includes('planejamento') || userPerms.includes('lancamento');
            if (!canClose) {
                this.showPermissionError();
                return false;
            }
            return true;
        }
        
        if (!this.hasPermission(requiredPermission)) {
            this.showPermissionError();
            return false;
        }
        
        return true;
    }

    showPermissionError() {
        // Criar modal de erro de permissão
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md mx-4">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <i class="w-6 h-6 text-red-600" data-lucide="shield-x"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-900">Acesso Negado</h3>
                        <p class="text-sm text-gray-600">Você não tem permissão para esta ação</p>
                    </div>
                </div>
                <div class="text-sm text-gray-600 mb-4">
                    Seu nível de acesso (<span class="font-medium capitalize">${this.currentUser?.role || 'desconhecido'}</span>) 
                    não permite executar esta operação.
                </div>
                <button class="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 transition-colors" onclick="this.closest('.fixed').remove()">
                    Entendi
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        lucide.createIcons();
        
        // Remover modal após 5 segundos
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 5000);
    }
}

// Instanciar sistema de autenticação
const authSystem = new AuthSystem();

// Exportar para uso global
window.authSystem = authSystem;
