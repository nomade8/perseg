// Importação das bibliotecas necessárias
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';


// Configurações do jogo
const CONFIG = {
    planoTamanho: 400,
    numObstaculos: 100,
    numInimigos: 10,
    velocidadeJogador: 17,
    velocidadeTiro: 500,
    velocidadeTiroInimigo: 250,
    tamanhoJogador: { x: 1.5, y: 7, z: 1.5 },
    tamanhoInimigo: { x: 2, y: 4, z: 2 },
    tamanhoObstaculo: { min: 10, max: 20 },
    alturaObstaculo: { min: 6, max: 25 },
    vidaMaximaJogador: 100,
    danoInimigo: 10,
    danoTiroInimigo: 10,
    pontosPorInimigo: 150,
    frequenciaTiroInimigo: 1 // Segundos entre tiros
    ,
    bigStarMinHeight: 500,
    bigStarMaxHeight: 1500,
    numPedrasDouradas: 3, // Número de pedras douradas por fase
    // Parâmetros do tranco da câmera quando o jogador atira
    gunShakeDuration: 0.12, // segundos
    gunShakeMagnitude: 0.6 // unidades de deslocamento máximo
};
// Pontos para destruir uma nave (bonus maior)
CONFIG.pontosPorNave = 2000;

// Variáveis globais
let camera, cameraPrimeiraP, miniMapCamera;
let scene, renderer;
let jogador, controlesJogador;
let inimigos = [];
let obstaculosData = []; // Armazenar dados dos obstáculos para colisão
let tirosAtivos = [];
let tirosInimigos = []; // Tiros dos inimigos
let teclasPressionadas = {};
let explosoes = [];
let pedrasDouradas = []; // Array para armazenar as pedras douradas
let pedrasDouradasColetadas = 0; // Contador de pedras douradas coletadas
let naves = []; // naves voadoras que aparecem ocasionalmente
let nextNaveSpawn = 10; // tempo (segundos) até spawn da próxima nave
let clock = new THREE.Clock();
let raycaster = new THREE.Raycaster();
let cameraTargetPosition = new THREE.Vector3(); // Posição alvo para interpolação da câmera
// Variáveis para efeito de tranco da câmera (recoil/shake)
let cameraShakeTimeLeft = 0;
let lastCameraShakeOffset = new THREE.Vector3();
// Áudios do jogo
let shotAudio = null;
let explosionMetallicAudio = null;

// Tentar inicializar os áudios (coloque os arquivos em assets/sounds/ ou ajuste o caminho)
try {
    shotAudio = new Audio('shot_gun.mp3');
    shotAudio.preload = 'auto';
    shotAudio.volume = 0.7;
} catch (e) {
    console.warn('Não foi possível carregar shot_gun.mp3:', e);
}
try {
    explosionMetallicAudio = new Audio('dry_explosion.mp3');
    explosionMetallicAudio.preload = 'auto';
    explosionMetallicAudio.volume = 0.2;
} catch (e) {
    console.warn('Não foi possível carregar explosion_metalic.mp3:', e);
}

// Helper: verifica se `child` é (ou está dentro de) `root` na hierarquia de objetos
function isDescendant(child, root) {
    let o = child;
    while (o) {
        if (o === root) return true;
        o = o.parent;
    }
    return false;
}

// Aplicar feedback visual de acerto (aumenta emissiveIntensity temporariamente)
function applyHitVisual(inimigo) {
    const root = inimigo.mesh;
    root.traverse(node => {
        if (node.isMesh && node.material && node.material.emissive !== undefined) {
            node.material.emissiveIntensity = Math.min((node.material.emissiveIntensity || 0.6) + 0.8, 3);
        }
    });
    criarExplosao(inimigo.mesh.position.clone());
}


// Variáveis do jogo
let vidaJogador = CONFIG.vidaMaximaJogador;
let pontuacao = 0;
let nivelDificuldade = 1;
let inimigosEliminados = 0;
let proximoNivel = CONFIG.numInimigos;
let jogoAtivo = true;
let ultimoTempoColisao = 0;
let levelMessageTimeout = null;
let faseConcluida = false; // evita aplicar bônus várias vezes
let phaseEndTimeout = null; // timeout para aguardar antes de finalizar a fase

// Função de inicialização
function init() {
    // Criar cena
    scene = new THREE.Scene();
    // Céu preto e estrelas

    // Adicionar estrelas em duas camadas:
    // 1) smallStars: muitas partículas pequenas espalhadas ao redor (fundo)
    const smallStarGeometry = new THREE.BufferGeometry();
    const smallStarVertices = [];
    const smallCount = 9000;
    for (let i = 0; i < smallCount; i++) {
        const x = (Math.random() - 0.5) * 4000;
        const y = (Math.random() - 0.5) * 4000;
        const z = (Math.random() - 0.5) * 4000;
        smallStarVertices.push(x, y, z);
    }
    smallStarGeometry.setAttribute('position', new THREE.Float32BufferAttribute(smallStarVertices, 3));
    const smallStarMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    const smallStars = new THREE.Points(smallStarGeometry, smallStarMaterial);
    scene.add(smallStars);

    // 2) bigStars: poucas partículas maiores, posicionadas bem acima do cenário para evitar que pareçam próximas
    const bigStarGeometry = new THREE.BufferGeometry();
    const bigStarVertices = [];
    const bigCount = 100;
    for (let i = 0; i < bigCount; i++) {
        const x = (Math.random() - 0.5) * 4000;
        // Garantir que as estrelas grandes fiquem acima do cenário (e não muito próximas)
        const y = CONFIG.bigStarMinHeight + Math.random() * (CONFIG.bigStarMaxHeight - CONFIG.bigStarMinHeight);
        // usar mesma distribuição em Z que nas outras camadas (centro +/-)
        const z = (Math.random() - 0.5) * 4000;
        bigStarVertices.push(x, y, z);
    }
    bigStarGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bigStarVertices, 3));
    const bigStarMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2.0, sizeAttenuation: true, transparent: true, opacity: 1.0 });
    const bigStars = new THREE.Points(bigStarGeometry, bigStarMaterial);
    scene.add(bigStars);
    // background já definido acima; usar névoa levemente colorida
    scene.fog = new THREE.Fog("#0e0707ff", 20, 1100);

    // Criar renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setScissorTest(true);
    document.body.appendChild(renderer.domElement);

    // Criar câmeras
    cameraPrimeiraP = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera = cameraPrimeiraP; // Câmera ativa
    cameraTargetPosition.copy(cameraPrimeiraP.position); // Inicializa a posição alvo da câmera

    // Criar câmera do minimapa
    miniMapCamera = new THREE.OrthographicCamera(-150, 150, 150, -150, 1, 1000);
    miniMapCamera.position.set(0, 100, 0);
    miniMapCamera.lookAt(0, 0, 0);
    
    // Configurar camadas das câmeras
    camera.layers.enable(0); // Camada padrão para câmera principal
    camera.layers.disable(1); // Desabilitar camada de marcadores na câmera principal
    
    miniMapCamera.layers.enable(1); // Apenas marcadores no minimapa
    miniMapCamera.layers.disable(0); // Desabilitar objetos principais no minimapa

    // Criar elementos do jogo
    adicionarIluminacao();
    criarPlano();
    criarObstaculos();
    criarPedrasDouradas(); // Chamar a função para criar as pedras douradas
    criarJogador();
    criarInimigos();
    configurarControles();
    setupLevelCompleteButton();
    
    // Configurar eventos
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    
    // Iniciar loop de animação
    animate();
}

// Inicializar o jogo quando a página carregar
init();


// Adicionar iluminação à cena
function adicionarIluminacao() {
    // Luz ambiente mais escura e avermelhada para o pôr do sol
    const luzAmbiente = new THREE.AmbientLight(0x443322, 0.8);
    luzAmbiente.autoUpdate = false;
    scene.add(luzAmbiente);

    // Luz hemisférica para um gradiente de pôr do sol (laranja/roxo)
    const hemiLight = new THREE.HemisphereLight(0xff7f00, 0x4a004a, 0.6); // Laranja do sol, roxo do crepúsculo
    hemiLight.autoUpdate = false;
    scene.add(hemiLight);
    
    // Luz direcional (sol) com cor de pôr do sol e mais fraca
    const luzDirecional = new THREE.DirectionalLight(0xffa040, 0.8); // Laranja avermelhado
    luzDirecional.position.set(100, 150, 100); // Posição mais baixa para simular pôr do sol
    luzDirecional.castShadow = true;
    luzDirecional.shadow.mapSize.width = 2048;
    luzDirecional.shadow.mapSize.height = 2048;
    luzDirecional.shadow.camera.near = 0.5;
    luzDirecional.shadow.camera.far = 500;
    luzDirecional.shadow.camera.left = -200;
    luzDirecional.shadow.camera.right = 200;
    luzDirecional.shadow.camera.top = 200;
    luzDirecional.shadow.camera.bottom = -200;
    luzDirecional.shadow.mapSize.autoUpdate = false;
    luzDirecional.autoUpdate = false;
    scene.add(luzDirecional);
}

// Criar plano do jogo
function criarPlano() {
    const tamanho = CONFIG.planoTamanho;
    const geometria = new THREE.PlaneGeometry(tamanho, tamanho);
    const material = new THREE.MeshStandardMaterial({ color: 0x3a5f0b, roughness: 0.9, metalness: 0.0 }); // verde mais escuro e fosco
    const plano = new THREE.Mesh(geometria, material);
    plano.rotation.x = -Math.PI / 2; // Rotacionar para ficar na horizontal
    plano.receiveShadow = true;
    
    // Criar marcador do plano para o minimapa
    const marcadorPlano = new THREE.Mesh(
        new THREE.PlaneGeometry(tamanho, tamanho),
        new THREE.MeshBasicMaterial({ color: 0x2d4a08, transparent: true, opacity: 0.8 })
    );
    marcadorPlano.rotation.x = -Math.PI / 2;
    marcadorPlano.position.y = 0.1; // Ligeiramente acima do plano principal
    marcadorPlano.layers.set(1); // Apenas no minimapa
    
    scene.add(plano);
    scene.add(marcadorPlano);
}

// Criar obstáculos usando InstancedMesh
function criarObstaculos() {
    const numObstaculos = CONFIG.numObstaculos;
    const tamanhoPlano = CONFIG.planoTamanho / 2; // Metade do tamanho para posicionar dentro dos limites
    
    // Limpar array de dados de obstáculos
    obstaculosData = [];
    
    // Posicionar cada obstáculo
    for (let i = 0; i < numObstaculos; i++) {
        // Gerar posição aleatória
        let x, z;
        let valido = false;
        
        // Garantir que os obstáculos não se sobreponham muito
        while (!valido) {
            x = (Math.random() - 0.5) * tamanhoPlano * 2;
            z = (Math.random() - 0.5) * tamanhoPlano * 2;
            
            // Verificar distância de outros obstáculos
            valido = true;
            for (let j = 0; j < obstaculosData.length; j++) {
                const obstaculoExistente = obstaculosData[j];
                const dx = x - obstaculoExistente.x;
                const dz = z - obstaculoExistente.z;
                const distancia = Math.sqrt(dx * dx + dz * dz);
                
                if (distancia < 3) { // Distância mínima entre obstáculos
                    valido = false;
                    break;
                }
            }
        }
        
        // Tamanho aleatório
        const largura = CONFIG.tamanhoObstaculo.min + Math.random() * (CONFIG.tamanhoObstaculo.max - CONFIG.tamanhoObstaculo.min);
        const altura = CONFIG.alturaObstaculo.min + Math.random() * (CONFIG.alturaObstaculo.max - CONFIG.alturaObstaculo.min);
        const profundidade = CONFIG.tamanhoObstaculo.min + Math.random() * (CONFIG.tamanhoObstaculo.max - CONFIG.tamanhoObstaculo.min);
        
        // Criar o corpo principal do prédio
        const geometriaCorpo = new THREE.BoxGeometry(largura, altura, profundidade);
        const materialCorpo = new THREE.MeshStandardMaterial({ color: 0x5d6d7e, roughness: 0.8, metalness: 0.1 });
        const corpoPredio = new THREE.Mesh(geometriaCorpo, materialCorpo);
        corpoPredio.position.set(0, altura / 2, 0); // Centralizar a base no Y=0
        corpoPredio.castShadow = true;
        corpoPredio.receiveShadow = true;

        const predio = new THREE.Group();
        predio.add(corpoPredio);

        // Adicionar janelas
        const numJanelas = Math.floor(altura / 5) * Math.floor(largura / 5); // Número de janelas proporcional ao tamanho
        const materialJanela = new THREE.MeshStandardMaterial({ color: 0x87CEEB, emissive: 0x0000ff, emissiveIntensity: 0.1 }); // Azul claro, levemente emissivo
        const tamanhoJanela = { largura: 2, altura: 3 };

        for (let j = 0; j < numJanelas; j++) {
            const geometriaJanela = new THREE.BoxGeometry(tamanhoJanela.largura, tamanhoJanela.altura, 0.1); // Fina para ser uma "placa"
            const janela = new THREE.Mesh(geometriaJanela, materialJanela);

            // Posição aleatória na face do prédio
            const face = Math.floor(Math.random() * 4); // 0: frente, 1: trás, 2: direita, 3: esquerda
            let posJanelaX, posJanelaY, posJanelaZ;

            // Garantir que as janelas fiquem dentro dos limites do prédio
            const margemX = (largura / 2) - (tamanhoJanela.largura / 2) - 0.5;
            const margemZ = (profundidade / 2) - (tamanhoJanela.largura / 2) - 0.5;
            const margemY = (altura / 2) - (tamanhoJanela.altura / 2) - 0.5;

            posJanelaY = (Math.random() * margemY * 2) - margemY + altura / 2; // Aleatório na altura

            switch (face) {
                case 0: // Frente (+Z)
                    posJanelaX = (Math.random() * margemX * 2) - margemX;
                    posJanelaZ = profundidade / 2 + 0.05; // Ligeiramente para fora
                    janela.rotation.y = 0;
                    break;
                case 1: // Trás (-Z)
                    posJanelaX = (Math.random() * margemX * 2) - margemX;
                    posJanelaZ = -profundidade / 2 - 0.05;
                    janela.rotation.y = Math.PI;
                    break;
                case 2: // Direita (+X)
                    posJanelaX = largura / 2 + 0.05;
                    posJanelaZ = (Math.random() * margemZ * 2) - margemZ;
                    janela.rotation.y = Math.PI / 2;
                    break;
                case 3: // Esquerda (-X)
                    posJanelaX = -largura / 2 - 0.05;
                    posJanelaZ = (Math.random() * margemZ * 2) - margemZ;
                    janela.rotation.y = -Math.PI / 2;
                    break;
            }
            janela.position.set(posJanelaX, posJanelaY, posJanelaZ);
            predio.add(janela);
        }

        // Adicionar porta (apenas uma por prédio, na face frontal)
        const materialPorta = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.8, metalness: 0.1 }); // Marrom escuro
        const larguraPorta = Math.min(largura * 0.3, 4); // Porta proporcional, mas com tamanho máximo
        const alturaPorta = Math.min(altura * 0.4, 6); // Porta proporcional, mas com tamanho máximo
        const geometriaPorta = new THREE.BoxGeometry(larguraPorta, alturaPorta, 0.2); // Fina para ser uma "placa"
        const porta = new THREE.Mesh(geometriaPorta, materialPorta);

        porta.position.set(0, alturaPorta / 2, profundidade / 2 + 0.1); // Centralizada na frente, ligeiramente para fora
        predio.add(porta);

        predio.position.set(x, 0, z); // Posicionar o grupo do prédio
        scene.add(predio);
        
        // Armazenar dados para colisão
        obstaculosData.push({
            x: x,
            z: z,
            largura: largura,
            altura: altura,
            profundidade: profundidade,
            minX: x - largura / 2,
            maxX: x + largura / 2,
            minZ: z - profundidade / 2,
            maxZ: z + profundidade / 2,
            mesh: predio // Armazenar a referência ao grupo do prédio
        });
        // predio é mantido na cena; mantemos a referência em obstaculosData.mesh
    }
    
    // Criar marcadores dos obstáculos para o minimapa
    const marcadorGeometria = new THREE.BoxGeometry(0.5, 0.1, 0.5);
    const marcadorMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 }); // Marrom para obstáculos
    const marcadoresObstaculos = new THREE.InstancedMesh(marcadorGeometria, marcadorMaterial, numObstaculos);
    marcadoresObstaculos.layers.set(1); // Apenas no minimapa
    
    // Posicionar marcadores nas mesmas posições dos obstáculos
    for (let i = 0; i < numObstaculos; i++) {
        const matrix = new THREE.Matrix4();
        const posicao = obstaculosData[i];
        matrix.setPosition(posicao.x, 1, posicao.z); // Y = 1 para ficar visível no minimapa
        marcadoresObstaculos.setMatrixAt(i, matrix);
    }
    marcadoresObstaculos.instanceMatrix.needsUpdate = true;
    
    scene.add(marcadoresObstaculos);
}

// Criar pedras douradas
function criarPedrasDouradas() {
    const tamanhoPlano = CONFIG.planoTamanho / 2;
    const numPedras = CONFIG.numPedrasDouradas;

    const geometriaPedra = new THREE.SphereGeometry(0.5, 16, 16);
    const materialPedra = new THREE.MeshBasicMaterial({ color: 0xFFD700 }); // Dourado

    // Remover eventuais pedras antigas que possam estar na cena (nomes com prefixo)
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];
        if (obj && obj.name && obj.name.indexOf && obj.name.indexOf('pedraDourada_') === 0) {
            scene.remove(obj);
        }
    }
    pedrasDouradas = []; // Limpar pedras existentes
    pedrasDouradasColetadas = 0; // Resetar contador

    for (let i = 0; i < numPedras; i++) {
        let x, z;
        let valido = false;
        let attempts = 0;
        const maxAttempts = 100;

        while (!valido && attempts < maxAttempts) {
            attempts++;
            x = (Math.random() - 0.5) * tamanhoPlano * 1.8; // Multiplicar por 1.8 para evitar bordas
            z = (Math.random() - 0.5) * tamanhoPlano * 1.8;

            const novaPosicaoPedra = new THREE.Vector3(x, 2, z); // Altura fixa para a pedra

            // Verificar colisão com obstáculos
            if (!verificarColisaoObstaculos(novaPosicaoPedra, { x: 2, y: 2, z: 2})) { // Tamanho da pedra para colisão
                valido = true;
            }
        }

        if (valido) {
            const pedra = new THREE.Mesh(geometriaPedra, materialPedra);
            pedra.position.set(x, 2, z);
            pedra.name = `pedraDourada_${i}`;
            scene.add(pedra);
            pedrasDouradas.push({ mesh: pedra, coletada: false });
            console.log(`[pedra criada] index:${i} pos: ${pedra.position.x.toFixed(1)},${pedra.position.z.toFixed(1)}`);
        } else {
            console.warn("Não foi possível posicionar a pedra dourada sem colidir com obstáculos.");
        }
    }
}

// Função para criar marcador de inimigo
function criarMarcador(cor, posicao) {
    const geometria = new THREE.SphereGeometry(3, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: cor });
    const marcador = new THREE.Mesh(geometria, material);
    marcador.position.copy(posicao);
    marcador.position.y += 5; // Acima do chão
    marcador.layers.set(1); // Atribuir à camada 1
    scene.add(marcador);
    return marcador;
}

// Função para criar marcador do jogador (triângulo)
function criarMarcadorJogador() {
    const geometria = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        0, 10, 0,   // Ponto de cima (aumentado)
        -2.5, -3, 0, // Canto inferior esquerdo (aumentado)
        2.5, -3, 0   // Canto inferior direito (aumentado)
    ]);
    geometria.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometria.setIndex([0, 1, 2]);

    const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const marcador = new THREE.Mesh(geometria, material);
    
    marcador.position.y = 6; // Posição Y fixa para o marcador no minimapa
    marcador.rotation.x = -Math.PI / 2; // Deitar o triângulo no plano XZ

    marcador.layers.set(1); // Apenas no minimapa
    scene.add(marcador);
    return marcador;
}

// Criar jogador
function criarJogador() {
    const geometria = new THREE.BoxGeometry(
        CONFIG.tamanhoJogador.x,
        CONFIG.tamanhoJogador.y,
        CONFIG.tamanhoJogador.z
    );
    const material = new THREE.MeshStandardMaterial({ color: '#fcfcfc', emissive: 0x082a3a, emissiveIntensity: 0.2, roughness: 0.6, metalness: 0.1 }); // azul visível
    jogador = new THREE.Mesh(geometria, material);
    jogador.position.set(0, CONFIG.tamanhoJogador.y / 2, 0);
    jogador.castShadow = true;
    jogador.receiveShadow = true;
   // scene.add(jogador);
    jogador.marcador = criarMarcadorJogador();
}

// Em criarInimigos, adicione marcadores
function criarInimigos() {
    const numInimigos = CONFIG.numInimigos;
    const tamanhoPlano = CONFIG.planoTamanho / 2;
    
    for (let i = 0; i < numInimigos; i++) {
        criarUmInimigo({avoidObstacles: true, speedScale: 1, type: 'robot'});
    }
}

// Criar uma nave voadora (group fornecido pelo usuário)
function criarNaveVoadora(initialPos = new THREE.Vector3(0, 40, -200)) {
    // Construir o grupo conforme o modelo fornecido
    const group = new THREE.Group();
    // torus
    const torusGeo = new THREE.TorusGeometry(1, 0.3, 32, 32);
    const torusMat = new THREE.MeshStandardMaterial({ color: '#800080', metalness: 0.5, roughness: 0.5 });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.position.set(0, -0.0274, 0);
    torus.rotation.set(-1.5676882686608438, 0, 0);
    torus.scale.set(1.1026, 1.1026, 0.5637);
    torus.castShadow = true;
    torus.receiveShadow = true;
    group.add(torus);
    // esfera
    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const sphereMat = new THREE.MeshStandardMaterial({ color: '#FF0000', metalness: 0.15, roughness: 0.1 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(0, 0.0274, 0);
    sphere.scale.set(1, 0.577, 1);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    group.add(sphere);

    group.position.copy(initialPos);
    group.scale.set(6, 6, 6);
    scene.add(group);

    // Propriedades da nave
    const nave = {
        mesh: group,
        hp: 8, // precisa de 8 tiros
        velocidade: 6 + Math.random() * 30, // velocidade horizontal
        direction: new THREE.Vector3(0, 0, 1), // irá atravessar o campo
        tempoProximoTiro: 1.0 + Math.random() * 2.5,
        tipo: 'nave'
    };
    naves.push(nave);
}

// Remover uma nave pelo índice; se destroyed=true, tocar efeitos de explosão e dar pontos
function removerNaveByIndex(index, destroyed = false) {
    if (index < 0 || index >= naves.length) return;
    const nave = naves[index];
    if (destroyed) {
        try { criarExplosao(nave.mesh.position.clone()); } catch (e) {}
        // Tocar som de explosão (usar explosionMetallicAudio se presente)
        try { if (explosionMetallicAudio) { explosionMetallicAudio.currentTime = 0; explosionMetallicAudio.play().catch(()=>{}); } } catch (e) {}
        // recompensa maior configurável
        const pontosPorNave = CONFIG.pontosPorNave || 2000;
        pontuacao += pontosPorNave;
        console.log('[nave destruida] pontos:', pontosPorNave);
        // Bônus: dar 20% da vida máxima do jogador ao destruir uma nave
        try {
            const bonusVida = (CONFIG.vidaMaximaJogador || 100) * 0.20; // 20%
            vidaJogador = (typeof vidaJogador === 'number' ? vidaJogador : 0) + bonusVida;
            // Não ultrapassar vida máxima
            vidaJogador = Math.min(vidaJogador, CONFIG.vidaMaximaJogador);
            console.log('[nave destruida] bônus de vida:', bonusVida, 'vida atual:', vidaJogador);
        } catch (e) { console.warn('Erro ao aplicar bonus de vida:', e); }
    }
    // remover mesh e array
    try { scene.remove(nave.mesh); } catch (e) {}
    naves.splice(index, 1);
    atualizarInterface();
}

// Spawna naves periodicamente (controlado no loop de animação através de nextNaveSpawn)
function atualizarNaves(delta) {
    // reduzir timer e tentar spawnar eventualmente, porém apenas após o nível 2 (a partir do nível 3)
    if (nivelDificuldade >= 3) {
        nextNaveSpawn -= delta;
        // Apenas uma nave ativa por vez
        if (nextNaveSpawn <= 0 && naves.length === 0) {
            // spawn em uma borda aleatória (z negativo ou positivo)
            const z = (Math.random() < 0.5) ? - (CONFIG.planoTamanho + 200) : (CONFIG.planoTamanho + 200);
            const x = (Math.random() - 0.5) * CONFIG.planoTamanho * 1.6;
            const y = 50 + Math.random() * 40;
            // criar nave e ajustar direção para atravessar o cenário
            criarNaveVoadora(new THREE.Vector3(x, y, z));
            // Ajustar direção da nave recém-criada com base no sinal de z
            if (naves.length > 0) {
                const nv = naves[naves.length - 1];
                nv.direction.z = (z < 0) ? 1 : -1;
            }
            // definir próximo spawn entre 20 e 40 segundos
            nextNaveSpawn = 20 + Math.random() * 20;
        }
    }

    // atualizar cada nave: mover e possivelmente atirar
    for (let i = naves.length - 1; i >= 0; i--) {
        const nave = naves[i];
        // mover na direção Z inversa dependendo da posição inicial
        const move = nave.direction.clone().multiplyScalar(nave.velocidade * delta);
        // Se a nave começou com z negativo, queremos que ela vá para +z (direction.z=1)
        nave.mesh.position.add(move);

        // se sair do campo, remover
        if (Math.abs(nave.mesh.position.z) > CONFIG.planoTamanho * 2) {
            scene.remove(nave.mesh);
            naves.splice(i, 1);
            continue;
        }

        // atirar de vez em quando na direção do jogador
        nave.tempoProximoTiro -= delta;
        if (nave.tempoProximoTiro <= 0) {
            // criar tiro apontando para o jogador
            const geo = new THREE.SphereGeometry(0.2, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffff66 });
            const tiro = new THREE.Mesh(geo, mat);
            tiro.position.copy(nave.mesh.position);
            scene.add(tiro);
            const dir = jogador.position.clone().sub(nave.mesh.position).normalize();
            tirosInimigos.push({ mesh: tiro, direcao: dir, distancia: 0 });
            nave.tempoProximoTiro = 1.0 + Math.random() * 2.0;
        }
    }
}

// Helper para criar um único inimigo com opções
function criarUmInimigo(opts = { avoidObstacles: true, speedScale: 1 }) {
    const tamanhoPlano = CONFIG.planoTamanho / 2;
    // Se opts.type === 'robot', construir um robô com primitivas
    let inimigo;
    if (opts.type === 'robot') {
        const group = new THREE.Group();

        // Corpo
        const corpoGeo = new THREE.CylinderGeometry(1.0, 1.2, 3.0, 12);
        const corpoMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.6, roughness: 0.4 });
        const corpo = new THREE.Mesh(corpoGeo, corpoMat);
        corpo.position.y = 1.5;
        corpo.castShadow = true;
        group.add(corpo);

        // Cabeça
        const cabecaGeo = new THREE.BoxGeometry(1.6, 1.2, 1.6);
        const cabecaMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.7, roughness: 0.3, emissive: 0x110000 });
        const cabeca = new THREE.Mesh(cabecaGeo, cabecaMat);
        cabeca.position.y = 3.0;
        cabeca.castShadow = true;
        group.add(cabeca);

        // Olhos (emissivos)
        const olhoGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const olhoMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8 });
        const olhoEsq = new THREE.Mesh(olhoGeo, olhoMat);
        const olhoDir = olhoEsq.clone();
        olhoEsq.position.set(-0.4, 3.05, 0.8);
        olhoDir.position.set(0.4, 3.05, 0.8);
        group.add(olhoEsq);
        group.add(olhoDir);

        // Braços simples
        const bracoGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
        const bracoMat = new THREE.MeshStandardMaterial({ color: 0x2b2b3b, metalness: 0.6, roughness: 0.4 });
        const bracoEsq = new THREE.Mesh(bracoGeo, bracoMat);
        const bracoDir = bracoEsq.clone();
        bracoEsq.position.set(-1.1, 1.5, 0);
        bracoDir.position.set(1.1, 1.5, 0);
        bracoEsq.castShadow = bracoDir.castShadow = true;
        group.add(bracoEsq);
        group.add(bracoDir);

        // Pequeno sinal no peito
        const badgeGeo = new THREE.BoxGeometry(0.4, 0.2, 0.05);
        const badgeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xff7700, emissiveIntensity: 0.6 });
        const badge = new THREE.Mesh(badgeGeo, badgeMat);
        badge.position.set(0, 1.8, 1.05);
        group.add(badge);

        inimigo = group;
    } else {
        // Geometria e material do inimigo padrão (caixa)
        const geometria = new THREE.BoxGeometry(
            CONFIG.tamanhoInimigo.x,
            CONFIG.tamanhoInimigo.y,
            CONFIG.tamanhoInimigo.z
        );
        const material = new THREE.MeshStandardMaterial({ color: 0xff2d2d, emissive: 0x7a0000, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.1 });
        inimigo = new THREE.Mesh(geometria, material);
    }

    // Posição aleatória
    let x, z;
    let valido = false;

    let attempts = 0;
    const maxAttempts = 1000;
    while (!valido && attempts < maxAttempts) {
        attempts++;
        x = (Math.random() - 0.5) * tamanhoPlano * 1.8;
        z = (Math.random() - 0.5) * tamanhoPlano * 1.8;

        // Verificar distância do jogador
        const dx = x - jogador.position.x;
        const dz = z - jogador.position.z;
        const distancia = Math.sqrt(dx * dx + dz * dz);

        if (distancia > 100) {
            if (opts.avoidObstacles) {
                const novaPosicaoInimigo = new THREE.Vector3(x, CONFIG.tamanhoInimigo.y / 2, z);
                if (!verificarColisaoObstaculos(novaPosicaoInimigo, CONFIG.tamanhoInimigo)) {
                    valido = true;
                }
            } else {
                valido = true;
            }
        }
    }

    // Se não encontrou posição válida depois de muitas tentativas, posiciona sem checar obstáculos
    if (!valido) {
        x = (Math.random() - 0.5) * tamanhoPlano * 1.8;
        z = (Math.random() - 0.5) * tamanhoPlano * 1.8;
        valido = true;
    }

    inimigo.position.set(x, CONFIG.tamanhoInimigo.y / 2, z);
    // Se for um grupo (robot), ajustar pelo grupo; caso contrário, mesh já tem propriedades
    if (inimigo.isGroup || inimigo.type === 'Group') {
        // 'Group' doesn't have castShadow property on group itself, children have it
        scene.add(inimigo);
    } else {
        inimigo.castShadow = true;
        inimigo.receiveShadow = true;
        scene.add(inimigo);
    }

    // Adicionar marcador (cor diferenciada para robots)
    const marcadorCor = (opts.type === 'robot') ? 0x9B59B6 : 0xFF0000;
    inimigo.marcador = criarMarcador(marcadorCor, inimigo.position);

    // Adicionar à lista de inimigos
    // velocidade base aumentada para tornar inimigos mais ágeis
    const baseVel = (1.0 + Math.random() * 2.0) * (opts.speedScale || 1);
    inimigos.push({
        mesh: inimigo,
        marcador: inimigo.marcador,
        hp: Math.floor(1 + Math.random() * 2), // Vida aleatória: 1 a 2 tiros
        baseVel: baseVel,
        velocidade: baseVel,
        direcao: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        tempoMudancaDirecao: 0,
        tempoProximoTiro: Math.random() * CONFIG.frequenciaTiroInimigo,
        isRobot: (opts.type === 'robot')
    });
}

// Configurar controles
function configurarControles() {
    controlesJogador = new PointerLockControls(cameraPrimeiraP, document.body);
    
    // Adicionar evento de clique para ativar os controles
    document.addEventListener('click', function() {
        if (jogoAtivo) {
            controlesJogador.lock();
        }
    });
    
    // Adicionar evento para quando os controles são ativados/desativados
    controlesJogador.addEventListener('lock', function() {
        document.getElementById('info').style.display = 'block';
        document.getElementById('info').style.opacity = '0.5';
    });
    
    controlesJogador.addEventListener('unlock', function() {
        document.getElementById('info').style.display = 'block';
        document.getElementById('info').style.opacity = '1';
    });
    
    // Inicializar interface
    atualizarInterface();
}

// Função para atirar
function atirar() {
    if (!jogoAtivo) return;
    
    // Geometria e material do tiro
    const geometria = new THREE.SphereGeometry(0.15, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: '#05f244' }); // Amarelo mais quente e brilhante
    const tiro = new THREE.Mesh(geometria, material);
    
    // Posição inicial (a partir do jogador)
    tiro.position.copy(jogador.position);
    tiro.position.y = jogador.position.y + CONFIG.tamanhoJogador.y / 3; // Altura do tiro
    
    // Direção do tiro (para onde a câmera está olhando)
    const direcao = new THREE.Vector3();
    cameraPrimeiraP.getWorldDirection(direcao);
    
    scene.add(tiro);
    
    // Adicionar à lista de tiros ativos
    tirosAtivos.push({
        mesh: tiro,
        direcao: direcao,
        distancia: 0 // Distância percorrida
    });
    // Aplicar tranco na câmera (recoil/shake) quando o jogador atira
    cameraShakeTimeLeft = CONFIG.gunShakeDuration;
    // gerar um deslocamento inicial aleatório leve
    lastCameraShakeOffset.set((Math.random() - 0.5) * CONFIG.gunShakeMagnitude, (Math.random() - 0.2) * CONFIG.gunShakeMagnitude, (Math.random() - 0.5) * CONFIG.gunShakeMagnitude);
    // Tocar som do tiro (se carregado)
    try { if (shotAudio) { shotAudio.currentTime = 0; shotAudio.play().catch(()=>{}); } } catch (e) { }
}

// Atualizar posição dos tiros
function atualizarTiros(delta) {
    if (!jogoAtivo) return;
    
    const velocidadeTiro = CONFIG.velocidadeTiro;
    const distanciaMaxima = 300; // Distância máxima que um tiro pode percorrer
    
    // Para cada tiro ativo
    for (let i = tirosAtivos.length - 1; i >= 0; i--) {
        const tiro = tirosAtivos[i];
        // Mover o tiro com verificação por raycast entre posição atual e próxima posição
        const movimento = tiro.direcao.clone().multiplyScalar(velocidadeTiro * delta);
        const movimentoComprimento = movimento.length();

        // Preparar raycaster para evitar tunneling
        const origem = tiro.mesh.position.clone();
        const direcao = movimento.clone().normalize();
        raycaster.set(origem, direcao);

    // Colete meshes dos inimigos e naves (targets possíveis)
    const enemyMeshes = inimigos.map(e => e.mesh).concat(naves.map(n => n.mesh));
        const intersects = enemyMeshes.length ? raycaster.intersectObjects(enemyMeshes, true) : [];

        let colisao = false;

        if (intersects.length > 0 && intersects[0].distance <= movimentoComprimento + 0.001) {
            // Acertou um inimigo no caminho
            const hit = intersects[0].object;
            // Primeiro checar inimigos normais
            for (let j = inimigos.length - 1; j >= 0; j--) {
                const inimigo = inimigos[j];
                if (isDescendant(hit, inimigo.mesh)) {
                    // Diminuir HP do inimigo; só mata quando hp <= 0
                    inimigo.hp = (inimigo.hp || 1) - 1;
                    colisao = true;
                    if (inimigo.hp <= 0) {
                        // Morte: explodir, remover marcador e mesh
                        criarExplosao(inimigo.mesh.position.clone());
                        // Tocar som metálico se for um robot
                        try { if (inimigo.isRobot && explosionMetallicAudio) { explosionMetallicAudio.currentTime = 0; explosionMetallicAudio.play().catch(()=>{}); } } catch (e) {}
                        if (inimigo.marcador) scene.remove(inimigo.marcador);
                        scene.remove(inimigo.mesh);
                        console.log('[inimigo eliminado] posição:', inimigo.mesh.position);
                        inimigos.splice(j, 1);
                        verificarFimDeFase();

                        pontuacao += CONFIG.pontosPorInimigo * nivelDificuldade;
                        inimigosEliminados++;
                        vidaJogador = Math.min(vidaJogador + (CONFIG.vidaMaximaJogador * 0.10), CONFIG.vidaMaximaJogador);
                        atualizarInterface();
                    } else {
                        // Acerto, mas não morte: aplicar feedback visual a todos os sub-meshes
                        applyHitVisual(inimigo);
                    }
                    break;
                }
            }
            // Se não foi inimigo, checar naves
            if (!colisao) {
                for (let j = naves.length - 1; j >= 0; j--) {
                    const nave = naves[j];
                    if (isDescendant(hit, nave.mesh)) {
                        // Acertou a nave
                        nave.hp = (nave.hp || 8) - 1;
                        colisao = true;
                        applyHitVisual(nave);
                        if (nave.hp <= 0) {
                            removerNaveByIndex(j, true);
                        }
                        break;
                    }
                }
            }
        }

        // Se não houve colisão por raycast, então mova o tiro e faça checagens por bounding boxes como fallback
        if (!colisao) {
            tiro.mesh.position.add(movimento);
            tiro.distancia += movimentoComprimento;

            // Fallback: colisão com inimigos por bounding boxes (casos raros)
            for (let j = inimigos.length - 1; j >= 0; j--) {
                const inimigo = inimigos[j];
                const tiroBox = new THREE.Box3().setFromObject(tiro.mesh);
                const inimigoBox = new THREE.Box3().setFromObject(inimigo.mesh);
                if (tiroBox.intersectsBox(inimigoBox)) {
                    // Diminuir HP; só matar quando hp <= 0
                    inimigo.hp = (inimigo.hp || 1) - 1;
                    colisao = true;
                    if (inimigo.hp <= 0) {
                        criarExplosao(inimigo.mesh.position.clone());
                        try { if (inimigo.isRobot && explosionMetallicAudio) { explosionMetallicAudio.currentTime = 0; explosionMetallicAudio.play().catch(()=>{}); } } catch (e) {}
                        if (inimigo.marcador) scene.remove(inimigo.marcador);
                        scene.remove(inimigo.mesh);
                        inimigos.splice(j, 1);
                        verificarFimDeFase();

                        pontuacao += CONFIG.pontosPorInimigo * nivelDificuldade;
                        inimigosEliminados++;
                        vidaJogador = Math.min(vidaJogador + (CONFIG.vidaMaximaJogador * 0.25), CONFIG.vidaMaximaJogador);
                        // antigo: não avançar automaticamente aqui; usar verificarFimDeFase + overlay
                        atualizarInterface();
                    } else {
                        applyHitVisual(inimigo);
                    }
                    break;
                }
            }

            // Checar colisão com naves por bounding box
            if (!colisao) {
                for (let j = naves.length - 1; j >= 0; j--) {
                    const nave = naves[j];
                    const tiroBox = new THREE.Box3().setFromObject(tiro.mesh);
                    const naveBox = new THREE.Box3().setFromObject(nave.mesh);
                    if (tiroBox.intersectsBox(naveBox)) {
                        nave.hp = (nave.hp || 8) - 1;
                        colisao = true;
                        applyHitVisual(nave);
                        if (nave.hp <= 0) {
                            removerNaveByIndex(j, true);
                        }
                        break;
                    }
                }
            }

            // Verificar colisões com obstáculos
            if (!colisao) {
                for (let j = 0; j < obstaculosData.length; j++) {
                    const obstaculo = obstaculosData[j];
                    const tiroBox = new THREE.Box3().setFromObject(tiro.mesh);
                    const obstaculoBox = new THREE.Box3(
                        new THREE.Vector3(obstaculo.minX, 0, obstaculo.minZ),
                        new THREE.Vector3(obstaculo.maxX, CONFIG.tamanhoInimigo.y * 2, obstaculo.maxZ)
                    );
                    if (tiroBox.intersectsBox(obstaculoBox)) {
                        colisao = true;
                        break;
                    }
                }
            }
        }

        // Remover tiro se colidiu ou alcançou distância máxima
        if (colisao || tiro.distancia > distanciaMaxima) {
            scene.remove(tiro.mesh);
            tirosAtivos.splice(i, 1);
        }
    }
}

// Função para inimigo atirar
function inimigoAtirar(inimigo) {
    // Geometria e material do tiro
    const geometria = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xFF6D3D }); // Laranja mais vivo para visibilidade
    const tiro = new THREE.Mesh(geometria, material);
    
    // Posição inicial (a partir do inimigo)
    tiro.position.copy(inimigo.mesh.position);
    tiro.position.y = inimigo.mesh.position.y + CONFIG.tamanhoInimigo.y / 3; // Altura do tiro
    
    // Direção do tiro (em direção ao jogador)
    const direcao = new THREE.Vector3();
    direcao.subVectors(jogador.position, inimigo.mesh.position);
    direcao.y = 0; // Manter no plano horizontal
    direcao.normalize();
    
    scene.add(tiro);
    
    // Adicionar à lista de tiros dos inimigos
    tirosInimigos.push({
        mesh: tiro,
        direcao: direcao,
        distancia: 0 // Distância percorrida
    });
}

// Atualizar movimento dos inimigos
function atualizarInimigos(delta) {
    if (!jogoAtivo) return;
    
    const tamanhoPlano = CONFIG.planoTamanho / 2;
    
    inimigos.forEach(inimigo => {
        // Compatibilidade: se o marcador estiver apenas no mesh (caso antigo), sincroniza para o objeto
        if (!inimigo.marcador && inimigo.mesh && inimigo.mesh.marcador) {
            inimigo.marcador = inimigo.mesh.marcador;
        }

        // Atualizar tempo para mudança de direção
        inimigo.tempoMudancaDirecao -= delta;
        
        if (inimigo.tempoMudancaDirecao <= 0) {
            // Mudar direção: mais propensos a seguir o jogador
            if (Math.random() < 0.5) { // 90% de chance de seguir o jogador
                const direcaoJogador = new THREE.Vector3();
                direcaoJogador.subVectors(jogador.position, inimigo.mesh.position);
                direcaoJogador.y = 0; // Manter no plano horizontal
                direcaoJogador.normalize();
                inimigo.direcao = direcaoJogador;
                // Aumentar velocidade momentânea ao perseguir
                inimigo.velocidade = inimigo.baseVel * (1.2 + Math.random() * 0.6); // 1.2x a 1.8x
            } else {
                // Direção aleatória (menos frequente agora)
                inimigo.direcao = new THREE.Vector3(
                    Math.random() - 0.5,
                    0,
                    Math.random() - 0.5
                ).normalize();
                // voltar à velocidade base
                inimigo.velocidade = inimigo.baseVel;
            }

            // Definir próxima mudança de direção (mais responsivo)
            inimigo.tempoMudancaDirecao = 1 + Math.random() * 2; // Entre 1 e 3 segundos
        }
        
        // Atualizar tempo para o próximo tiro
        inimigo.tempoProximoTiro -= delta;
        
        // Verificar se é hora de atirar
        if (inimigo.tempoProximoTiro <= 0) {
            // Calcular distância até o jogador
            const distanciaJogador = inimigo.mesh.position.distanceTo(jogador.position);
            
            // Atirar apenas se estiver a uma distância razoável
            if (distanciaJogador < 100) {
                inimigoAtirar(inimigo);
            }
            
            // Definir tempo para o próximo tiro
            inimigo.tempoProximoTiro = CONFIG.frequenciaTiroInimigo + Math.random() * 1; // Adicionar aleatoriedade
        }
        
        // Calcular nova posição
        const movimento = inimigo.direcao.clone().multiplyScalar(inimigo.velocidade * delta);
        const novaPos = inimigo.mesh.position.clone().add(movimento);
        
        // Verificar colisão com obstáculos
        if (!verificarColisaoObstaculos(novaPos, CONFIG.tamanhoInimigo)) {
            // Aplicar movimento apenas se não houver colisão
            inimigo.mesh.position.copy(novaPos);
            
            // Atualizar posição do marcador
            if (inimigo.marcador) {
                inimigo.marcador.position.copy(inimigo.mesh.position);
                inimigo.marcador.position.y = inimigo.mesh.position.y + 5;
            }
            
            // Limitar ao tamanho do plano
            inimigo.mesh.position.x = Math.max(-tamanhoPlano, Math.min(tamanhoPlano, inimigo.mesh.position.x));
            inimigo.mesh.position.z = Math.max(-tamanhoPlano, Math.min(tamanhoPlano, inimigo.mesh.position.z));
            
            // Rotacionar inimigo na direção do movimento
            if (movimento.length() > 0) {
                inimigo.mesh.lookAt(inimigo.mesh.position.clone().add(inimigo.direcao));
            }
        } else {
            // Se colidir, mudar direção
            inimigo.direcao = new THREE.Vector3(
                Math.random() - 0.5,
                0,
                Math.random() - 0.5
            ).normalize();
        }

        // Amortecer possível emissiveIntensity aumentado por hits em todos os sub-meshes
        inimigo.mesh.traverse(node => {
            if (node.isMesh && node.material && node.material.emissive !== undefined) {
                node.material.emissiveIntensity = Math.max(0.6, (node.material.emissiveIntensity || 0.6) - delta * 1.5);
            }
        });
    });
}

// Verificar colisão com obstáculos
function verificarColisaoObstaculos(posicao, tamanho) {
    const entityBox = new THREE.Box3(
        new THREE.Vector3(posicao.x - tamanho.x / 2, posicao.y - tamanho.y / 2, posicao.z - tamanho.z / 2),
        new THREE.Vector3(posicao.x + tamanho.x / 2, posicao.y + tamanho.y / 2, posicao.z + tamanho.z / 2)
    );

    for (let i = 0; i < obstaculosData.length; i++) {
        const obstaculo = obstaculosData[i];
        const obstaculoBox = new THREE.Box3(
            new THREE.Vector3(obstaculo.minX, 0, obstaculo.minZ),
            new THREE.Vector3(obstaculo.maxX, obstaculo.altura, obstaculo.maxZ)
        );

        if (entityBox.intersectsBox(obstaculoBox)) {
            return true; // Colisão detectada
        }
    }
    return false; // Sem colisão
}

// Atualizar movimento do jogador
function atualizarJogador(delta) {
    if (!jogoAtivo) return;
    
    const velocidade = CONFIG.velocidadeJogador * delta;
    const tamanhoPlano = CONFIG.planoTamanho / 2;
    
    // Direção de movimento baseada na câmera
    const direcao = new THREE.Vector3();
    const rotacao = cameraPrimeiraP.getWorldDirection(direcao);
    
    // Vetor para frente (Z)
    const frente = new THREE.Vector3();
    frente.copy(direcao);
    frente.y = 0; // Manter no plano horizontal
    frente.normalize();
    
    // Vetor para direita (X)
    const direita = new THREE.Vector3();
    direita.crossVectors(frente, new THREE.Vector3(0, 1, 0));
    
    // Movimento baseado nas teclas pressionadas
    let movimento = new THREE.Vector3(0, 0, 0);
    
    if (teclasPressionadas['ArrowUp'] || teclasPressionadas['w']) {
        movimento.add(frente.clone().multiplyScalar(velocidade));
    }
    if (teclasPressionadas['ArrowDown'] || teclasPressionadas['s']) {
        movimento.add(frente.clone().multiplyScalar(-velocidade));
    }
    if (teclasPressionadas['ArrowLeft'] || teclasPressionadas['a']) {
        movimento.add(direita.clone().multiplyScalar(-velocidade));
    }
    if (teclasPressionadas['ArrowRight'] || teclasPressionadas['d']) {
        movimento.add(direita.clone().multiplyScalar(velocidade));
    }
    
    // Verificar colisão antes de aplicar o movimento
    const novaPos = jogador.position.clone().add(movimento);
    
    // Verificar colisão com obstáculos
    if (!verificarColisaoObstaculos(novaPos, CONFIG.tamanhoJogador)) {
        // Aplicar movimento apenas se não houver colisão
        jogador.position.copy(novaPos);

        // Atualizar posição do marcador do jogador
        if (jogador.marcador) {
            jogador.marcador.position.copy(jogador.position);
            jogador.marcador.position.y = 6; // Posição Y fixa
            
            // Rotacionar o marcador para que a ponta do triângulo aponte para a direção do movimento
            // Se houver movimento, usar o vetor de movimento; caso contrário, usar a frente da câmera
            const dirMovimento = movimento.clone();
            dirMovimento.y = 0;
            if (dirMovimento.length() > 0.0001) {
                dirMovimento.normalize();
                // Ângulo no plano XZ: atan2(x, z) -> 0 aponta para +Z
                // Adiciona PI para inverter 180 graus (triângulo estava apontando invertido)
                const ang = Math.atan2(dirMovimento.x, dirMovimento.z) + Math.PI;
                jogador.marcador.rotation.z = ang;
            } else {
                // Fallback: usar a frente da câmera para orientar o marcador
                const frenteCopy = frente.clone();
                frenteCopy.y = 0;
                frenteCopy.normalize();
                const ang = Math.atan2(frenteCopy.x, frenteCopy.z) + Math.PI;
                jogador.marcador.rotation.z = ang;
            }
        }
    
        // Rotacionar jogador na direção do movimento
        if (movimento.length() > 0) {
            jogador.lookAt(jogador.position.clone().add(frente));
        }
        
        // Atualizar a posição alvo da câmera com a posição atual do jogador
        cameraTargetPosition.copy(jogador.position);
        cameraTargetPosition.y = jogador.position.y + CONFIG.tamanhoJogador.y / 2; // Altura dos olhos

        // Interpolar a posição atual da câmera para a posição alvo
        cameraPrimeiraP.position.lerp(cameraTargetPosition, 0.3); // O 0.1 é o fator de interpolação, ajuste conforme necessário

        // Verificar colisão com pedras douradas
        for (let i = pedrasDouradas.length - 1; i >= 0; i--) {
            const pedra = pedrasDouradas[i];
            if (!pedra.coletada) {
                // Calcular distância apenas no plano horizontal (XZ) para evitar problemas de altura
                const dx = jogador.position.x - pedra.mesh.position.x;
                const dz = jogador.position.z - pedra.mesh.position.z;
                const distanciaXZ = Math.sqrt(dx * dx + dz * dz);
                if (distanciaXZ < 6) { // Raio horizontal para coletar a pedra
                    pedra.coletada = true;
                    scene.remove(pedra.mesh);
                    console.log(`[pedra coletada] index: ${i} pos: ${pedra.mesh.position.x.toFixed(1)},${pedra.mesh.position.z.toFixed(1)}`);
                    // Aplicar efeitos imediatos: +500 pontos por pedra e restaurar vida ao máximo (não acumulável)
                    pedrasDouradasColetadas++;
                    const pontosPorPedra = 500;
                    pontuacao += pontosPorPedra;
                    // Restaurar vida do jogador para máximo (não acumulativa)
                    vidaJogador = CONFIG.vidaMaximaJogador;
                    atualizarInterface(); // Atualizar a interface para mostrar pontuação e pedras coletadas

                    // Se coletou todas as pedras, ainda verificar se a fase deve encerrar (inimigos podem já estar mortos)
                    if (pedrasDouradasColetadas >= CONFIG.numPedrasDouradas) {
                        verificarFimDeFase();
                    }
                }
            }
        }

        // Removido atualização de cameraAerea
        
        // Verificar colisão com inimigos
        verificarColisaoInimigos();
    }
}

// Eventos de teclado
function onKeyDown(event) {
    teclasPressionadas[event.key] = true;
    
    // Reiniciar jogo com a tecla 'R'
    if ((event.key === 'r' || event.key === 'R') && !jogoAtivo) {
        reiniciarJogo();
    }
}

function onKeyUp(event) {
    teclasPressionadas[event.key] = false;
}

// Evento de clique do mouse (atirar)
function onMouseDown(event) {
    // Apenas atirar se os controles estiverem ativos e for o botão esquerdo
    if (controlesJogador.isLocked && event.button === 0) {
        atirar();
    }
}

// Redimensionar janela
function onWindowResize() {
    cameraPrimeiraP.aspect = window.innerWidth / window.innerHeight;
    cameraPrimeiraP.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Verificar colisão entre jogador e inimigos
function verificarColisaoInimigos() {
    const tempoAtual = performance.now();
    // Verificar colisão apenas a cada 500ms para evitar dano muito rápido
    if (tempoAtual - ultimoTempoColisao < 500) return;
    
    for (let i = 0; i < inimigos.length; i++) {
        const inimigo = inimigos[i];
        const distancia = jogador.position.distanceTo(inimigo.mesh.position);
        
        // Se o inimigo estiver muito próximo do jogador
        if (distancia < CONFIG.tamanhoJogador.x + 1) {
            // Reduzir vida do jogador
            vidaJogador -= CONFIG.danoInimigo;
            ultimoTempoColisao = tempoAtual;
            
            // Atualizar interface
            atualizarInterface();
            
            // Verificar se o jogador morreu
            if (vidaJogador <= 0) {
                gameOver();
            }
            
            break; // Apenas um dano por vez
        }
    }
}

// Aumentar nível de dificuldade
function aumentarNivel() {
    // permitir que uma nova fase possa ser concluída novamente
    faseConcluida = false;
    if (phaseEndTimeout) { clearTimeout(phaseEndTimeout); phaseEndTimeout = null; }
    nivelDificuldade++;
    proximoNivel = CONFIG.numInimigos + (nivelDificuldade - 1); // 10, 11, 12, 13...
    
    // Criar novos inimigos para o próximo nível (um a mais que o nível anterior)
    const quantidadeInimigos = CONFIG.numInimigos + (nivelDificuldade - 1);
    criarInimigosAdicionais(quantidadeInimigos);
    
    // Resetar contador de inimigos eliminados
    inimigosEliminados = 0;
    
    // Atualizar interface
    atualizarInterface();
    
    // Efeito visual de mudança de nível
    const infoElement = document.getElementById('info');
    infoElement.style.color = '#ffff00';
    infoElement.style.fontSize = '20px';
    infoElement.innerHTML = `NÍVEL ${nivelDificuldade}! ${quantidadeInimigos} inimigos!`;
    
    // Restaurar estilo após 2 segundos
    setTimeout(() => {
        infoElement.style.color = 'white';
        infoElement.style.fontSize = '16px';
        atualizarInterface();
    }, 2000);
    // Criar novas pedras douradas para a próxima fase
    criarPedrasDouradas();
}

// Criar inimigos adicionais durante o jogo
function criarInimigosAdicionais(quantidade) {
    for (let i = 0; i < quantidade; i++) {
        // Criar inimigo respeitando obstáculos e com velocidade aumentada pelo nível
    criarUmInimigo({ avoidObstacles: true, speedScale: 1 + (nivelDificuldade - 1) * 0.2, type: 'robot' });
        // Ajustar tempo de tiro inicial para o inimigo recém-criado (mais frequente em níveis altos)
        const ultimo = inimigos[inimigos.length - 1];
        if (ultimo) ultimo.tempoProximoTiro = Math.random() * (CONFIG.frequenciaTiroInimigo / nivelDificuldade);
    }
}

// Atualizar interface do jogo
function atualizarInterface() {
    const infoElement = document.getElementById('info');
    infoElement.innerHTML = `Pontuação: ${pontuacao} | Nível: ${nivelDificuldade} | Pedras Douradas: ${pedrasDouradasColetadas} / ${CONFIG.numPedrasDouradas} | Use as setas para mover, mouse para mirar, clique para atirar`;
    
    // Atualizar barra de vida
    const healthFill = document.getElementById('health-fill');
    if (healthFill) {
        const percentage = (vidaJogador / CONFIG.vidaMaximaJogador) * 100;
        healthFill.style.width = `${percentage}%`;
        if (percentage > 50) {
            healthFill.style.backgroundColor = 'green';
        } else if (percentage > 20) {
            healthFill.style.backgroundColor = 'yellow';
        } else {
            healthFill.style.backgroundColor = 'red';
        }
    }
}

// Game Over
function gameOver() {
    jogoAtivo = false;
    // Garantir que o overlay de fim de fase não esteja visível
    hideLevelComplete();
    // Mostrar mensagem de game over
    const infoElement = document.getElementById('info');
    infoElement.innerHTML = `GAME OVER! Pontuação final: ${pontuacao} | Pressione R para reiniciar`;
    infoElement.style.color = 'red';
    infoElement.style.fontSize = '24px';
    
    // Desbloquear o mouse
    controlesJogador.unlock();
}

// Reiniciar jogo
function reiniciarJogo() {
    // Resetar variáveis do jogo
    vidaJogador = CONFIG.vidaMaximaJogador;
    pontuacao = 0;
    jogoAtivo = true;
    nivelDificuldade = 1;
    inimigosEliminados = 0;
    proximoNivel = CONFIG.numInimigos;
    
    // Limpar inimigos existentes
    for (let i = inimigos.length - 1; i >= 0; i--) {
        scene.remove(inimigos[i].mesh);
        if (inimigos[i].marcador) {
            scene.remove(inimigos[i].marcador);
        }
    }
    inimigos = [];
    
    // Limpar tiros ativos
    for (let i = tirosAtivos.length - 1; i >= 0; i--) {
        scene.remove(tirosAtivos[i].mesh);
    }
    tirosAtivos = [];
    
    // Limpar tiros dos inimigos
    for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        scene.remove(tirosInimigos[i].mesh);
    }
    tirosInimigos = [];
    
    // Recriar inimigos
    criarInimigos();
    
    // Resetar posição do jogador
    jogador.position.set(0, CONFIG.tamanhoJogador.y / 2, 0);
    
    // Resetar interface
    const infoElement = document.getElementById('info');
    infoElement.style.color = 'white';
    infoElement.style.fontSize = '16px';
    hideLevelComplete();
    faseConcluida = false;
    if (phaseEndTimeout) { clearTimeout(phaseEndTimeout); phaseEndTimeout = null; }
    atualizarInterface();
}

// Atualizar tiros dos inimigos
function atualizarTirosInimigos(delta) {
    if (!jogoAtivo) return;
    
    const velocidadeTiro = CONFIG.velocidadeTiroInimigo;
    const distanciaMaxima = 200; // Distância máxima que um tiro pode percorrer
    
    // Para cada tiro ativo
    for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        const tiro = tirosInimigos[i];
        
        // Mover o tiro
        const movimento = tiro.direcao.clone().multiplyScalar(velocidadeTiro * delta);
        tiro.mesh.position.add(movimento);
        tiro.distancia += movimento.length();
        
        // Verificar colisão com o jogador
        const distanciaJogador = tiro.mesh.position.distanceTo(jogador.position);
        let colisao = false;
        
        if (distanciaJogador < CONFIG.tamanhoJogador.x) { // Raio de colisão
            // Reduzir vida do jogador
            vidaJogador -= CONFIG.danoTiroInimigo;
            atualizarInterface();
            
            // Verificar se o jogador morreu
            if (vidaJogador <= 0) {
                gameOver();
            }
            
            // Marcar tiro para remoção
            colisao = true;
        }
        
        // Verificar colisões com obstáculos
        if (!colisao) {
            for (let j = 0; j < obstaculosData.length; j++) {
                const obstaculo = obstaculosData[j];
                
                // Criar um BoundingBox para o tiro
                const tiroBox = new THREE.Box3().setFromObject(tiro.mesh);

                // Criar um BoundingBox para o obstáculo
                const obstaculoBox = new THREE.Box3(
                    new THREE.Vector3(obstaculo.minX, 0, obstaculo.minZ),
                    new THREE.Vector3(obstaculo.maxX, obstaculo.altura, obstaculo.maxZ)
                );

                // Verificar colisão entre o tiro e o obstáculo
                if (tiroBox.intersectsBox(obstaculoBox)) {
                    colisao = true;
                    break;
                }
            }
        }
        
        // Remover tiro se colidiu ou alcançou distância máxima
        if (colisao || tiro.distancia > distanciaMaxima) {
            scene.remove(tiro.mesh);
            tirosInimigos.splice(i, 1);
        }
    }
}

// Verificar fim de fase
function verificarFimDeFase() {
    // DEBUG: logar sempre que a verificação ocorrer para ajudar a entender o estado
    console.log('[verificarFimDeFase] inimigos:', inimigos.length, 'pedrasColetadas:', pedrasDouradasColetadas, 'necessarias:', CONFIG.numPedrasDouradas);
    const enemiesDone = inimigos.length === 0;
    const stonesDone = pedrasDouradasColetadas >= CONFIG.numPedrasDouradas;

    // Nova regra: fase termina quando TODOS os inimigos forem eliminados.
    // Ao terminar, o jogador ganha 500 pontos por cada pedra que tiver coletado.
    if (enemiesDone && !faseConcluida) {
        faseConcluida = true;
        // Aguarda 2 segundos antes de finalizar a fase para dar tempo ao jogador
        // de recolher pedras que estiverem próximas.
        if (phaseEndTimeout) {
            clearTimeout(phaseEndTimeout);
            phaseEndTimeout = null;
        }

        // Mostrar mensagem temporária ao jogador
        const infoElement = document.getElementById('info');
        if (infoElement) {
            infoElement.style.color = '#ffd700';
            infoElement.style.fontSize = '18px';
            infoElement.innerHTML = `Todos os inimigos eliminados! Finalizando fase em 2 segundos...`;
        }

        phaseEndTimeout = setTimeout(() => {
            phaseEndTimeout = null;
            const bonusPorPedra = 500;
            const bonus = pedrasDouradasColetadas * bonusPorPedra;
            // Observação: os pontos por pedra já foram aplicados no momento da coleta.
            console.log(`Fase concluída! Inimigos eliminados. Pedras coletadas: ${pedrasDouradasColetadas}, bônus (já aplicado): ${bonus}`);
            // Mostrar painel de fim de fase com a pontuação atual e info sobre as pedras (sem reaplicar pontos)
            showLevelComplete(pontuacao, pedrasDouradasColetadas, bonus);
        }, 2000);

        return;
    }

    // Se não terminou, fornecer feedback específico para o jogador
    const infoElement = document.getElementById('info');
    if (!infoElement) return;

    // Limpar timeout anterior se existir
    if (levelMessageTimeout) {
        clearTimeout(levelMessageTimeout);
        levelMessageTimeout = null;
    }

    if (!stonesDone && enemiesDone) {
        // Todos inimigos mortos, faltam pedras
        const faltam = CONFIG.numPedrasDouradas - pedrasDouradasColetadas;
        infoElement.style.color = '#ffd700';
        infoElement.style.fontSize = '18px';
        infoElement.innerHTML = `Inimigos eliminados! Faltam ${faltam} pedra(s) dourada(s) para concluir a fase.`;
    } else if (stonesDone && !enemiesDone) {
        // Todas pedras coletadas, faltam inimigos
        infoElement.style.color = '#ff704d';
        infoElement.style.fontSize = '18px';
        infoElement.innerHTML = `Pedras coletadas! Elimine todos os inimigos restantes para concluir a fase.`;
    } else {
        // Nenhuma das condições completa — mostrar estado resumido
        infoElement.style.color = 'white';
        infoElement.style.fontSize = '16px';
        infoElement.innerHTML = `Pontuação: ${pontuacao} | Nível: ${nivelDificuldade} | Pedras Douradas: ${pedrasDouradasColetadas} / ${CONFIG.numPedrasDouradas}`;
    }

    // Restaurar a interface padrão após 2.5s
    levelMessageTimeout = setTimeout(() => {
        levelMessageTimeout = null;
        infoElement.style.color = 'white';
        infoElement.style.fontSize = '16px';
        atualizarInterface();
    }, 2500);
}

// Mostrar overlay de fase concluída
function showLevelComplete(pontos, pedrasColetadas = 0, bonus = 0) {
    jogoAtivo = false;
    // Destravar o ponteiro caso esteja trancado
    if (controlesJogador && controlesJogador.isLocked) controlesJogador.unlock();
    const overlay = document.getElementById('level-complete');
    const scoreEl = document.getElementById('level-complete-score');
    if (scoreEl) {
        let txt = `Você fez ${pontos} pontos`;
        if (pedrasColetadas !== undefined) {
            txt += `\nPedras coletadas: ${pedrasColetadas} (bônus ${bonus} pontos)`;
        }
        // Usar textContent e respetivar quebras de linha
        scoreEl.textContent = txt;
    }
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        // Registrar listener de tecla Enter para iniciar próxima fase
        document.addEventListener('keydown', overlayEnterHandler);
        // Focar o botão para acessibilidade (mesmo que esteja desabilitado para clique)
        const btn = document.getElementById('next-level-btn');
        if (btn) btn.focus();
    }
}

// Esconder overlay e reiniciar estado para próxima fase
function hideLevelComplete() {
    const overlay = document.getElementById('level-complete');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        // Remover listener de tecla Enter quando o overlay for ocultado
        document.removeEventListener('keydown', overlayEnterHandler);
    }
}

// Ligar evento do botão de próxima fase (se existir)
function setupLevelCompleteButton() {
    const btn = document.getElementById('next-level-btn');
    if (!btn) return;
    // Não iniciar a fase via clique para evitar inícios acidentais por tiros;
    // apenas garantir que o botão possa receber foco para acessibilidade.
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        // noop - use ENTER em vez de clique
    });
}

// Handler de teclado para o overlay: Enter inicia próxima fase
function overlayEnterHandler(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        startNextPhaseFromOverlay();
    }
}

// Centraliza a lógica de começar a próxima fase a partir do overlay
function startNextPhaseFromOverlay() {
    // Evitar múltiplas chamadas idempotentes
    const overlay = document.getElementById('level-complete');
    if (!overlay || overlay.getAttribute('aria-hidden') === 'true') return;

    // limpar qualquer timeout pendente
    if (phaseEndTimeout) { clearTimeout(phaseEndTimeout); phaseEndTimeout = null; }
    hideLevelComplete();
    // Avançar para o próximo nível: manter pontuação e aumentar dificuldade
    aumentarNivel();
    // Reativar o jogo
    jogoAtivo = true;
    atualizarInterface();
}

// Loop de animação
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    // Atualizar jogador
    atualizarJogador(delta);
    
    // Atualizar inimigos
    atualizarInimigos(delta);
    // Atualizar naves voadoras (spawn, movimento e tiros)
    atualizarNaves(delta);
    
    // Atualizar tiros
    atualizarTiros(delta);
    
    // Atualizar tiros dos inimigos
    atualizarTirosInimigos(delta);

    // Atualizar explosões
    atualizarExplosoes(delta);
    
    // Atualizar posição da miniMapCamera para centralizar no jogador
    miniMapCamera.position.set(jogador.position.x, 100, jogador.position.z);
    miniMapCamera.lookAt(jogador.position);
    
    // Aplicar tranco (camera shake) se ativo
    let originalCameraPos = null;
    if (cameraShakeTimeLeft > 0) {
        // salvar posição original
        originalCameraPos = camera.position.clone();
        // calcular fração restante (0..1)
        const t = cameraShakeTimeLeft / CONFIG.gunShakeDuration;
        // ease-out: usar t*t for smoothing (stronger at start)
        const ease = t * t;
        // gerar um offset aleatório pequeno que decresce com o tempo
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * CONFIG.gunShakeMagnitude * ease,
            (Math.random() - 0.5) * CONFIG.gunShakeMagnitude * 0.6 * ease,
            (Math.random() - 0.5) * CONFIG.gunShakeMagnitude * ease
        );
        camera.position.add(offset);
        // reduzir timer
        cameraShakeTimeLeft = Math.max(0, cameraShakeTimeLeft - delta);
    }

    // Renderizar cena principal com viewport completo
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);

    // restaurar posição original da câmera se alterada
    if (originalCameraPos) {
        camera.position.copy(originalCameraPos);
    }
    
    // Renderizar mini mapa
    const miniMapSize = 200;
    const miniMapX = window.innerWidth - miniMapSize - 10;
    const miniMapY = 10;
    renderer.setViewport(miniMapX, miniMapY, miniMapSize, miniMapSize);
    renderer.setScissor(miniMapX, miniMapY, miniMapSize, miniMapSize);
    renderer.render(scene, miniMapCamera);
}

// Explosão visual quando inimigo é eliminado
function criarExplosao(posicao) {
    const grupo = new THREE.Group();
    grupo.position.copy(posicao);

    // Partículas
    const count = 60;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
        // Inicialmente nas proximidades do centro
        positions[i * 3 + 0] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;

        const dir = new THREE.Vector3(
            (Math.random() - 0.5),
            (Math.random() - 0.2), // tende a “subir” um pouco
            (Math.random() - 0.5)
        ).normalize();

        const speed = 25 + Math.random() * 20; // velocidade de explosão
        velocities.push(dir.multiplyScalar(speed));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color: 0xFFAA55,
        size: 0.5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const pontos = new THREE.Points(geo, mat);
    grupo.add(pontos);

    // Flash esférico rápido
    const flashGeo = new THREE.SphereGeometry(1, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xFFF4C1,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.scale.set(0.3, 0.3, 0.3);
   // grupo.add(flash);

    scene.add(grupo);

    explosoes.push({
        group: grupo,
        points: pontos,
        geo,
        mat,
        velocities,
        flash,
        flashGeo,
        flashMat,
        age: 0,
        lifetime: 0.6 // duração curta e impactante
    });
}

// Atualização das explosões por frame
function atualizarExplosoes(delta) {
    for (let i = explosoes.length - 1; i >= 0; i--) {
        const e = explosoes[i];
        e.age += delta;
        const t = e.age / e.lifetime;

        // Atualiza partículas
        const posAttr = e.geo.getAttribute('position');
        for (let p = 0; p < e.velocities.length; p++) {
            // posição corrente
            const idx = p * 3;
            // aplica velocidade
            posAttr.array[idx + 0] += e.velocities[p].x * delta;
            posAttr.array[idx + 1] += e.velocities[p].y * delta;
            posAttr.array[idx + 2] += e.velocities[p].z * delta;
            // leve gravidade + amortecimento
            e.velocities[p].y -= 30 * delta;
            e.velocities[p].multiplyScalar(0.98);
        }
        posAttr.needsUpdate = true;

        // Fade das partículas
        e.mat.opacity = Math.max(0, 1.0 - t);

        // Flash: expande e some
        if (e.flash) {
            const add = 5.0 * delta;
            e.flash.scale.x += add;
            e.flash.scale.y += add;
            e.flash.scale.z += add;
            e.flash.material.opacity = Math.max(0, 0.85 * (1.0 - t));
        }

        // Remover ao fim
        if (e.age >= e.lifetime) {
            scene.remove(e.group);
            // Dispose para evitar vazamento de memória
            e.geo.dispose();
            e.mat.dispose();
            if (e.flashGeo) e.flashGeo.dispose();
            if (e.flashMat) e.flashMat.dispose();
            explosoes.splice(i, 1);
        }
    }
}