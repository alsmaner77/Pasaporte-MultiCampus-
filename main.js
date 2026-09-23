import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { completeChallenge, sincronizarRetosUsuario, filterMissions } from './retos.js';
import { 
    cargarBandejaEntrada, abrirSalaDeChat, enviarMensajeTexto, 
    procesarYEnviarFoto, iniciarVideollamada, buscarNuevaConexion, 
    actualizarMapaYSellos, currentChatId,
    abrirModalGrupo, crearGrupoIntercampus
} from './chat.js';
import { abrirCamaraWeb, cerrarCamaraWeb, capturarFotoWebcam } from './ia-vision.js';

// ==========================================
// EXPOSICIÓN GLOBAL PARA EVENTOS DE HTML
// ==========================================
window.completeChallenge = completeChallenge;
window.filterMissions = filterMissions;

// 1. Navegación por la Barra Lateral (Sidebar)
window.openTab = function(evt, tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const target = document.getElementById(tabName);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }

    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }

    // Actualizar migaja de pan superior
    const breadcrumb = document.getElementById('current-view-title');
    if (breadcrumb) {
        const titulos = {
            retos: "Ruta de 8 Semanas",
            conexion: "Radar de Talentos",
            mapa: "Ecosistema Nacional",
            mensajes: "Hub de Escuadrones",
            perfil: "Mi Pasaporte"
        };
        breadcrumb.textContent = titulos[tabName] || "Dashboard";
    }
};

// ==========================================
// 2. AUTENTICACIÓN (LOGIN & REGISTRO)
// ==========================================
const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const campusSelect = document.getElementById('campus-select');
const carreraSelect = document.getElementById('carrera-select');
const certificadoSelect = document.getElementById('certificado-select');
const authError = document.getElementById('auth-error');

const btnLogin = document.getElementById('btn-login-action');
const btnRegister = document.getElementById('btn-register-action');
const linkToggle = document.getElementById('link-toggle');
const textToggle = document.getElementById('text-toggle');
const registerFields = document.getElementById('register-fields');
const authTitle = document.getElementById('auth-title');

let isLoginView = true;

// Alternar entre Iniciar Sesión y Registro
linkToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginView = !isLoginView;
    authError.style.display = "none";

    if (isLoginView) {
        authTitle.textContent = "Accede a tu cuenta";
        registerFields.style.display = "none";
        btnLogin.style.display = "flex";
        btnRegister.style.display = "none";
        textToggle.textContent = "¿Nuevo en el ecosistema?";
        linkToggle.textContent = "Regístrate aquí";
    } else {
        authTitle.textContent = "Crea tu Pasaporte";
        registerFields.style.display = "block";
        btnLogin.style.display = "none";
        btnRegister.style.display = "flex";
        textToggle.textContent = "¿Ya tienes pasaporte?";
        linkToggle.textContent = "Inicia sesión";
    }
});

// Acción Iniciar Sesión
btnLogin.addEventListener('click', async () => {
    try {
        await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    } catch (err) {
        authError.textContent = "Correo o contraseña incorrectos.";
        authError.style.display = "block";
    }
});

// Acción Registrarse (Con Certificado para la Rúbrica)
btnRegister.addEventListener('click', async () => {
    if (!campusSelect.value || !carreraSelect.value || !certificadoSelect.value) {
        authError.textContent = "Por favor selecciona tu Campus, Carrera y Certificado.";
        authError.style.display = "block";
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
        await setDoc(doc(db, "usuarios", cred.user.uid), {
            correo: emailInput.value.trim(),
            campus: campusSelect.value,
            carrera: carreraSelect.value,
            certificado: certificadoSelect.value,
            fecha_registro: new Date().toISOString(),
            progreso_porcentaje: 0,
            retos_completados: {}
        });
    } catch (err) {
        authError.textContent = "Error al registrarse: " + err.message;
        authError.style.display = "block";
    }
});

// Cerrar Sesión
document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
});

// ==========================================
// 3. OBSERVADOR DE SESIÓN (CARGA DE DATOS)
// ==========================================
let miCampusActual = "";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContent.style.display = 'block';

        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            miCampusActual = data.campus || "";

            // Actualizar datos de Perfil
            document.getElementById('profile-email').textContent = data.correo || user.email;
            document.getElementById('profile-campus').textContent = `Campus: ${data.campus || 'Sin definir'}`;
            document.getElementById('profile-certificado').textContent = data.certificado || 'Certificado General';

            // Actualizar Topbar
            document.getElementById('topbar-user-name').textContent = (data.correo || user.email).split('@')[0];
            document.getElementById('topbar-user-campus').textContent = `Campus ${data.campus || ''}`;
            document.getElementById('topbar-avatar').textContent = (data.correo || 'EX').substring(0, 2).toUpperCase();

            // Avatar personalizado
            if (data.foto_perfil && data.foto_perfil.startsWith('data:image')) {
                document.getElementById('profile-pic').src = data.foto_perfil;
            }

            // Sincronizar Retos, Chats y Mapa
            sincronizarRetosUsuario(data);
            cargarBandejaEntrada();
            actualizarMapaYSellos();
        }
    } else {
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    }
});

// ==========================================
// 4. LISTENERS DE CONTROLES DE LA APP
// ==========================================

// Radar de emparejamiento con filtros
document.getElementById('btn-find-partner').addEventListener('click', () => {
    const filtros = {
        campus: document.getElementById('radar-campus').value,
        carrera: document.getElementById('radar-carrera').value,
        certificado: document.getElementById('radar-certificado').value
    };
    
    buscarNuevaConexion(miCampusActual, filtros);
});

// Enviar Mensajes
document.getElementById('btn-send-message').addEventListener('click', enviarMensajeTexto);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarMensajeTexto();
});

// Regresar a la bandeja
document.getElementById('btn-back-to-inbox').addEventListener('click', () => {
    document.getElementById('chat-room-view').style.display = 'none';
    document.getElementById('inbox-view').style.display = 'block';
});

// Videollamada Jitsi
document.getElementById('btn-video-call').addEventListener('click', iniciarVideollamada);

// Adjuntar fotos y cámara
const chatImgInput = document.getElementById('chat-img-input');
const chatCameraInput = document.getElementById('chat-camera-input');

document.getElementById('btn-attach-img').addEventListener('click', () => chatImgInput.click());
document.getElementById('btn-take-photo').addEventListener('click', () => {
    // Detección estricta para forzar la cámara del sistema operativo móvil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia("(max-width: 768px)").matches;
    
    if (isMobile) {
        chatCameraInput.click(); // Abre la app de la cámara del celular
    } else {
        abrirCamaraWeb(); // Abre el modal de la computadora
    }
});

const procesarArchivoInput = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => procesarYEnviarFoto(ev.target.result);
        reader.readAsDataURL(file);
    }
};

chatImgInput.addEventListener('change', procesarArchivoInput);
chatCameraInput.addEventListener('change', procesarArchivoInput);

// Botones del Modal Webcam
document.getElementById('btn-close-webcam').addEventListener('click', cerrarCamaraWeb);
document.getElementById('btn-capture-webcam').addEventListener('click', () => {
    const foto = capturarFotoWebcam();
    if (foto) procesarYEnviarFoto(foto);
});

// Cambiar foto de perfil
document.getElementById('upload-pic').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && auth.currentUser) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const b64 = ev.target.result;
            document.getElementById('profile-pic').src = b64;
            await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { foto_perfil: b64 });
        };
        reader.readAsDataURL(file);
    }
});

// Listeners Modal Escuadrones
document.getElementById('btn-open-group-modal').addEventListener('click', abrirModalGrupo);

document.getElementById('btn-cancel-group').addEventListener('click', () => {
    document.getElementById('group-modal').style.display = 'none';
});

document.getElementById('btn-confirm-group').addEventListener('click', crearGrupoIntercampus);
