// Script de teste Firebase
console.log('🔥 Iniciando teste Firebase...');

// Função para testar conexão Firebase
async function testFirebaseConnection() {
    try {
        console.log('📊 Testando Firebase...');
        
        // Verificar se Firebase está carregado
        if (typeof firebase === 'undefined') {
            console.error('❌ Firebase não está carregado');
            return;
        }
        
        console.log('✅ Firebase carregado');
        
        // Testar configuração
        const app = firebase.app();
        console.log('✅ App Firebase:', app.name);
        
        // Testar Firestore
        const db = firebase.firestore();
        console.log('✅ Firestore conectado');
        
        // Testar escrita simples
        const testData = {
            teste: true,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            data: new Date().toISOString()
        };
        
        console.log('📝 Tentando escrever dados de teste...');
        const docRef = await db.collection('test').add(testData);
        console.log('✅ Documento de teste criado:', docRef.id);
        
        // Testar leitura
        console.log('📖 Tentando ler dados de teste...');
        const snapshot = await db.collection('test').limit(1).get();
        console.log('✅ Dados lidos:', snapshot.size, 'documentos');
        
        // Limpar teste
        await docRef.delete();
        console.log('🗑️ Documento de teste removido');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro no teste Firebase:', error);
        console.error('Código:', error.code);
        console.error('Mensagem:', error.message);
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
            
            const docRef = await firebase.firestore()
                .collection(collectionName)
                .add(testDoc);
                
            console.log(`✅ ${collectionName}: documento criado com ID ${docRef.id}`);
            
            // Limpar
            await docRef.delete();
            console.log(`🗑️ ${collectionName}: documento de teste removido`);
            
        } catch (error) {
            console.error(`❌ Erro em ${collectionName}:`, error.code, error.message);
        }
    }
}

// Executar testes
testFirebaseConnection().then(success => {
    if (success) {
        console.log('🎉 Firebase funcionando! Testando coleções específicas...');
        testCollectionWrite();
    } else {
        console.log('💥 Firebase com problemas. Verifique a configuração.');
    }
});