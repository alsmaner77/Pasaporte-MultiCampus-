import { db, auth } from './firebase-config.js';
import { 
    collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, 
    query, where, orderBy, onSnapshot, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { completeChallenge } from './retos.js';
import { comprimirImagen, detectarComidaConIA, abrirCamaraWeb, capturarFotoWebcam } from './ia-vision.js';

export let currentChatId = null;
let unsubscribeChat = null;
let unsubscribeInbox = null;

// ==========================================
// 1. RADAR DE EMPAREJAMIENTO MULTICAMPUS
// ==========================================
export async function buscarNuevaConexion(miCampus, filtros = {}) {
    if (!auth.currentUser) return;

    const btnFind = document.getElementById('btn-find-partner');
    const searchStatus = document.getElementById('search-status');

    searchStatus.style.display = 'block';
    searchStatus.textContent = "Sintonizando frecuencias intercampus con tus filtros...";
    btnFind.disabled = true;

    try {
        const myUid = auth.currentUser.uid;

        // 1. Obtener chats previos para no repetir compañeros
        const chatsRef = collection(db, "chats");
        const misChatsQ = query(chatsRef, where("participantes", "array-contains", myUid));
        const misChatsSnap = await getDocs(misChatsQ);

        let yaConectados = [myUid]; // Incluirme a mí mismo para no seleccionarme
        misChatsSnap.forEach(snap => {
            const parts = snap.data().participantes || [];
            parts.forEach(p => { if (p !== myUid) yaConectados.push(p); });
        });

        // 2. Traer estudiantes y filtrarlos localmente (evita errores de índices en Firebase)
        const usuariosRef = collection(db, "usuarios");
        const snapshot = await getDocs(usuariosRef);

        let disponibles = [];
        snapshot.forEach(docSnap => {
            const uid = docSnap.id;
            const uData = docSnap.data();

            // Si ya he hablado con esta persona, saltarla
            if (yaConectados.includes(uid)) return;

            // Filtro Campus: Si el usuario seleccionó "Todos", evitamos emparejar con el mismo campus por defecto.
            if (filtros.campus && filtros.campus !== "Todos") {
                if (uData.campus !== filtros.campus) return;
            } else {
                if (uData.campus === miCampus) return;
            }

            // Filtro Carrera
            if (filtros.carrera && filtros.carrera !== "Todas" && uData.carrera !== filtros.carrera) return;

            // Filtro Certificado
            if (filtros.certificado && filtros.certificado !== "Todos" && uData.certificado !== filtros.certificado) return;

            disponibles.push({ id: uid, ...uData });
        });

        if (disponibles.length === 0) {
            searchStatus.textContent = "No encontramos a nadie disponible con esos filtros. ¡Intenta cambiarlos!";
            btnFind.disabled = false;
            return;
        }

        // 3. Selección aleatoria entre los disponibles
        const partner = disponibles[Math.floor(Math.random() * disponibles.length)];
        const partnerUid = partner.id;
        
        // Crear un ID único de chat ordenando los UIDs alfabéticamente
        const chatId = myUid < partnerUid ? `${myUid}_${partnerUid}` : `${partnerUid}_${myUid}`;

        // Crear documento del chat
        const chatDocRef = doc(db, "chats", chatId);
        await setDoc(chatDocRef, {
            participantes: [myUid, partnerUid],
            ultimo_mensaje: "¡Nueva conexión de radar iniciada!",
            fecha_actualizacion: serverTimestamp()
        }, { merge: true });

        // Autovalidar Reto 1 (Onboarding Multicampus)
        const myUserSnap = await getDoc(doc(db, "usuarios", myUid));
        if (myUserSnap.exists() && (!myUserSnap.data().retos_completados || !myUserSnap.data().retos_completados[1])) {
            await completeChallenge(1, "México conectado", 12.5);
        }

        searchStatus.style.display = 'none';
        btnFind.disabled = false;

        // Cambiar a la pestaña de mensajes y abrir la sala
        window.openTab(null, 'mensajes');
        abrirSalaDeChat(chatId, partner);

    } catch (err) {
        console.error("Error en radar:", err);
        searchStatus.textContent = "Error de sintonización. Inténtalo de nuevo.";
        btnFind.disabled = false;
    }
}

// ==========================================
// 2. BANDEJA DE ENTRADA EN TIEMPO REAL
// ==========================================
export function cargarBandejaEntrada() {
    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;

    const chatsRef = collection(db, "chats");
    const qInbox = query(chatsRef, where("participantes", "array-contains", myUid));

    if (unsubscribeInbox) unsubscribeInbox();

    unsubscribeInbox = onSnapshot(qInbox, async (snapshot) => {
        const chatsList = document.getElementById('chats-list');
        const emptyMsg = document.getElementById('empty-chats-msg');
        if (!chatsList) return;

        if (snapshot.empty) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            chatsList.innerHTML = '';
            chatsList.appendChild(emptyMsg);
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';

        const docsOrdenados = snapshot.docs.sort((a, b) => {
            const tA = a.data().fecha_actualizacion?.toMillis() || 0;
            const tB = b.data().fecha_actualizacion?.toMillis() || 0;
            return tB - tA;
        });

        const chatsData = await Promise.all(docsOrdenados.map(async (dSnap) => {
            const cData = dSnap.data();
            const cId = dSnap.id;

            if (cData.isGroup) {
                return {
                    cId, cData,
                    partner: {
                        correo: `👥 ${cData.groupName}`,
                        campus: `${cData.participantes.length} integrantes`,
                        foto_perfil: ""
                    }
                };
            } else {
                const partnerUid = cData.participantes.find(id => id !== myUid);
                const pSnap = await getDoc(doc(db, "usuarios", partnerUid));
                return {
                    cId, cData,
                    partner: pSnap.exists() ? pSnap.data() : { correo: "Estudiante", campus: "Campus" }
                };
            }
        }));

        chatsList.innerHTML = '';
        chatsData.forEach(({ cId, cData, partner }) => {
            const li = document.createElement('li');
            li.className = 'inbox-item';
            li.style.cssText = "padding: 14px; background: #ffffff; border: 1px solid var(--border-subtle); border-radius: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 14px; cursor: pointer;";
            
            const pic = (partner.foto_perfil && partner.foto_perfil.startsWith('data:image'))
                ? partner.foto_perfil
                : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><rect width='44' height='44' fill='%2300765C'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='18'>👥</text></svg>";

            li.innerHTML = `
                <img src="${pic}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--tec-green-light);">
                <div style="flex:1; overflow:hidden;">
                    <h4 style="margin:0; font-size:14px; color:var(--text-primary); font-weight:700;">${partner.correo}</h4>
                    <p style="margin:2px 0 0; font-size:12px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cData.ultimo_mensaje || "Nueva conversación"}</p>
                </div>
            `;
            li.onclick = () => abrirSalaDeChat(cId, partner);
            chatsList.appendChild(li);
        });
    });
}

// ==========================================
// 3. SALA DE CHAT ACTIVA (MENSAJES EN VIVO)
// ==========================================
export function abrirSalaDeChat(chatId, partner) {
    currentChatId = chatId;

    document.getElementById('inbox-view').style.display = 'none';
    const roomView = document.getElementById('chat-room-view');
    roomView.style.display = 'flex';

    // Identificar si es un grupo (Escuadrón)
    const esGrupo = partner.correo.includes("👥");

    document.getElementById('chat-partner-email').textContent = esGrupo ? partner.correo.replace("👥 ", "") : partner.correo;
    document.getElementById('chat-partner-campus').textContent = esGrupo ? "Chat de Escuadrón" : partner.campus;

    const chatPic = document.getElementById('chat-partner-pic');
    chatPic.src = (partner.foto_perfil && partner.foto_perfil.startsWith('data:image'))
        ? partner.foto_perfil
        : (esGrupo 
            ? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><rect width='44' height='44' fill='%2300765C'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='18'>👥</text></svg>"
            : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='%23004D3C'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='16'>🎓</text></svg>");

    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    if (unsubscribeChat) unsubscribeChat();

    const msgRef = collection(db, "chats", chatId, "mensajes");
    const qMsg = query(msgRef, orderBy("timestamp", "asc"));

    unsubscribeChat = onSnapshot(qMsg, (snapshot) => {
        container.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const esMio = msg.senderId === auth.currentUser.uid;

            const bubble = document.createElement('div');
            bubble.style.cssText = `
                max-width: 72%;
                padding: 10px 15px;
                border-radius: 14px;
                word-wrap: break-word;
                font-size: 13.5px;
                line-height: 1.4;
                align-self: ${esMio ? 'flex-end' : 'flex-start'};
                background: ${esMio ? 'var(--tec-green-primary)' : '#ffffff'};
                color: ${esMio ? '#ffffff' : 'var(--text-primary)'};
                border: ${esMio ? 'none' : '1px solid var(--border-subtle)'};
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            `;

            let header = (!esMio && msg.senderEmail) 
                ? `<div style="font-size:10px; font-weight:700; color:var(--tec-green-light); margin-bottom:3px;">${msg.senderEmail.split('@')[0]}</div>` 
                : '';

            let content = msg.texto || '';
            if (msg.imagenUrl) {
                // Corrección del Scroll obligando al contenedor a bajar cuando la imagen termina de cargar
                content = `<img src="${msg.imagenUrl}" style="max-width: 220px; border-radius: 8px; margin-top: 5px; display: block;" onload="document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight">`;
            }

            bubble.innerHTML = header + content;
            container.appendChild(bubble);
        });

        // Asegurar scroll suave
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    });
}
// Enviar Mensaje de Texto
export async function enviarMensajeTexto() {
    const input = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send-message');
    const texto = input.value.trim();
    
    if (!texto || !currentChatId || !auth.currentUser) return;

    if (btnSend) btnSend.disabled = true; // Prevenir doble envío
    const textoGuardado = texto;
    input.value = '';

    try {
        const msgRef = collection(db, "chats", currentChatId, "mensajes");
        await addDoc(msgRef, {
            texto: textoGuardado,
            senderId: auth.currentUser.uid,
            senderEmail: auth.currentUser.email,
            timestamp: serverTimestamp()
        });

        await updateDoc(doc(db, "chats", currentChatId), {
            ultimo_mensaje: textoGuardado,
            fecha_actualizacion: serverTimestamp()
        });
    } catch (e) {
        console.error("Error enviando mensaje:", e);
        alert("No se pudo enviar el mensaje. Revisa tu conexión.");
    } finally {
        if (btnSend) btnSend.disabled = false; // Reactivar botón
        input.focus();
    }
}

// ==========================================
// 4. ENVÍO DE IMÁGENES + EVALUACIÓN CON IA
// ==========================================
export async function procesarYEnviarFoto(base64Original) {
    if (!currentChatId || !auth.currentUser) return;

    try {
        // Comprimir en Canvas
        const comprimida = await comprimirImagen(base64Original, 600);

        // Validar con IA (MobileNet) en segundo plano
        const tempImg = new Image();
        tempImg.src = comprimida;
        tempImg.onload = async () => {
            const esComida = await detectarComidaConIA(tempImg);

            // Si detecta comida, autocompleta el Reto 3
            if (esComida) {
                const userSnap = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
                if (userSnap.exists() && (!userSnap.data().retos_completados || !userSnap.data().retos_completados[3])) {
                    await completeChallenge(3, "Explorador gastronómico", 12.5);
                }
            }

            // Subir a Firestore
            const msgRef = collection(db, "chats", currentChatId, "mensajes");
            await addDoc(msgRef, {
                texto: "📷 Foto de evidencia",
                imagenUrl: comprimida,
                senderId: auth.currentUser.uid,
                senderEmail: auth.currentUser.email,
                timestamp: serverTimestamp()
            });

            await updateDoc(doc(db, "chats", currentChatId), {
                ultimo_mensaje: "📷 Foto compartida",
                fecha_actualizacion: serverTimestamp()
            });
        };
    } catch (err) {
        console.error("Error procesando foto:", err);
    }
}

// ==========================================
// 5. VIDEOLLAMADAS JITSI (SERVIDOR ABIERTO)
// ==========================================
export async function iniciarVideollamada() {
    if (!currentChatId || !auth.currentUser) return;

    // Generar nombre de sala único
    const roomName = "Pasaporte" + currentChatId.replace(/[^a-zA-Z0-9]/g, "");
    
    // Usamos el servidor público abierto 'meet.ffmuc.net' para evitar el bloqueo de anfitrión
    // y forzamos la entrada directa sin sala de espera.
    const jitsiUrl = `https://meet.ffmuc.net/${roomName}#config.prejoinPageEnabled=false`;

    window.open(jitsiUrl, '_blank');

    try {
        const msgRef = collection(db, "chats", currentChatId, "mensajes");
        await addDoc(msgRef, {
            texto: `📹 ¡He abierto una sala síncrona! Da clic arriba para unirte sin contraseñas.`,
            senderId: auth.currentUser.uid,
            senderEmail: auth.currentUser.email,
            timestamp: serverTimestamp()
        });

        await updateDoc(doc(db, "chats", currentChatId), {
            ultimo_mensaje: "📹 Invitación a videollamada",
            fecha_actualizacion: serverTimestamp()
        });
    } catch (e) {
        console.error("Error al notificar videollamada:", e);
    }
}

// ==========================================
// 6. MAPA NACIONAL Y SELLOS EN EL PASAPORTE
// ==========================================
export async function actualizarMapaYSellos() {
    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;

    try {
        const chatsRef = collection(db, "chats");
        const qChats = query(chatsRef, where("participantes", "array-contains", myUid));
        const snap = await getDocs(qChats);

        let partnerUids = [];
        snap.forEach(d => {
            (d.data().participantes || []).forEach(uid => {
                if (uid !== myUid && !partnerUids.includes(uid)) partnerUids.push(uid);
            });
        });

        let conteo = {};
        for (const uid of partnerUids) {
            const pSnap = await getDoc(doc(db, "usuarios", uid));
            if (pSnap.exists()) {
                const c = pSnap.data().campus;
                if (c) conteo[c] = (conteo[c] || 0) + 1;
            }
        }

        // Iluminar pines en el mapa
        document.querySelectorAll('.campus-pin').forEach(pin => {
            const campus = pin.getAttribute('data-campus');
            const tooltipCount = pin.querySelector('.count');
            if (conteo[campus]) {
                pin.classList.add('active');
                if (tooltipCount) tooltipCount.textContent = conteo[campus];
            } else {
                pin.classList.remove('active');
                if (tooltipCount) tooltipCount.textContent = "0";
            }
        });

        // Estampar sellos en la página derecha del pasaporte
        const stampsGrid = document.getElementById("passport-stamps-grid");
        const noStampsMsg = document.getElementById("no-stamps-msg");

        if (stampsGrid) {
            stampsGrid.innerHTML = '';
            const campuses = Object.keys(conteo);

            if (campuses.length > 0) {
                if (noStampsMsg) noStampsMsg.style.display = 'none';
                const tintas = ['red', 'blue', 'green'];
                const fecha = new Date().toLocaleDateString();

                campuses.forEach((campus, idx) => {
                    const rotacion = Math.floor(Math.random() * 40) - 20;
                    const stamp = document.createElement("div");
                    stamp.className = `sello-campus ${tintas[idx % tintas.length]}`;
                    stamp.style.transform = `rotate(${rotacion}deg)`;
                    stamp.innerHTML = `
                        <span class="sello-nombre">${campus}</span>
                        <span class="sello-fecha">${fecha}</span>
                    `;
                    stampsGrid.appendChild(stamp);
                });
            } else {
                if (noStampsMsg) {
                    noStampsMsg.style.display = 'block';
                    stampsGrid.appendChild(noStampsMsg);
                }
            }
        }
    } catch (e) {
        console.error("Error actualizando mapa/sellos:", e);
    }
}

// ==========================================
// 7. ESCUADRONES (GRUPOS)
// ==========================================
export async function abrirModalGrupo() {
    const modal = document.getElementById('group-modal');
    const list = document.getElementById('group-connections-list');
    list.innerHTML = '<p style="text-align:center; font-size:13px; padding:10px;">Cargando conexiones...</p>';
    modal.style.display = 'flex';

    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    
    try {
        // Extraer todos los contactos únicos de los chats actuales (individuales y grupos previos)
        const chatsRef = collection(db, "chats");
        const q = query(chatsRef, where("participantes", "array-contains", myUid));
        const snap = await getDocs(q);
        
        let contactosUids = new Set();
        snap.forEach(docSnap => {
            const data = docSnap.data();
            data.participantes.forEach(uid => {
                if (uid !== myUid) contactosUids.add(uid); // El Set asegura que no se dupliquen ni desaparezcan
            });
        });

        list.innerHTML = '';
        if (contactosUids.size === 0) {
            list.innerHTML = '<p style="font-size:12px; color:var(--text-secondary); text-align:center;">No tienes conexiones aún. Usa el Radar para conectar con alguien primero.</p>';
            return;
        }

        // Renderizar los contactos disponibles como checkboxes
        for (let uid of contactosUids) {
            const userSnap = await getDoc(doc(db, "usuarios", uid));
            if (userSnap.exists()) {
                const uData = userSnap.data();
                const div = document.createElement('div');
                div.style.cssText = "display: flex; align-items: center; gap: 10px; margin-bottom: 10px; background: var(--bg-surface-subtle); padding: 8px; border-radius: 6px; border: 1px solid var(--border-subtle);";
                div.innerHTML = `
                    <input type="checkbox" id="chk-${uid}" value="${uid}" class="group-checkbox" style="width: 16px; height: 16px; accent-color: var(--tec-green-primary);">
                    <label for="chk-${uid}" style="font-size: 13px; cursor: pointer; flex: 1;">
                        <b>${uData.correo.split('@')[0]}</b> <span style="color:var(--text-muted); font-size:11px;">(${uData.campus})</span>
                    </label>
                `;
                list.appendChild(div);
            }
        }
    } catch (e) {
        console.error("Error al cargar contactos:", e);
        list.innerHTML = '<p style="font-size:12px; color:red;">Error al cargar las conexiones.</p>';
    }
}

export async function crearGrupoIntercampus() {
    const nameInput = document.getElementById('group-name').value.trim();
    if (!nameInput) {
        alert("Por favor, dale un nombre a tu escuadrón.");
        return;
    }

    const checkboxes = document.querySelectorAll('.group-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Selecciona al menos 1 conexión para formar el escuadrón.");
        return;
    }

    const myUid = auth.currentUser.uid;
    let participantes = [myUid];
    checkboxes.forEach(chk => participantes.push(chk.value));

    try {
        const btnConfirm = document.getElementById('btn-confirm-group');
        btnConfirm.disabled = true;
        btnConfirm.textContent = "Creando...";

        const groupId = "grupo_" + Date.now();
        
        await setDoc(doc(db, "chats", groupId), {
            isGroup: true,
            groupName: nameInput,
            participantes: participantes,
            ultimo_mensaje: "¡Escuadrón formado con éxito!",
            fecha_actualizacion: serverTimestamp(),
            adminId: myUid
        });

        // Validar en automático el Reto 4 (Armar Escuadrón)
        const myUserSnap = await getDoc(doc(db, "usuarios", myUid));
        if (myUserSnap.exists() && (!myUserSnap.data().retos_completados || !myUserSnap.data().retos_completados[4])) {
            await completeChallenge(4, "Equipo Sin Fronteras", 12.5);
        }

        // Cerrar modal y resetear campos
        document.getElementById('group-modal').style.display = 'none';
        document.getElementById('group-name').value = '';
        
    } catch (e) {
        console.error("Error al crear grupo:", e);
        alert("Hubo un problema al crear el escuadrón.");
    } finally {
        const btnConfirm = document.getElementById('btn-confirm-group');
        btnConfirm.disabled = false;
        btnConfirm.textContent = "Crear Grupo";
    }
}
