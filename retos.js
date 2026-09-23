import { db, auth } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export let userProgress = 0;
export let userStampsCount = 0;

// Diccionario de insignias correspondientes a cada reto
export const insigniasMapa = {
    1: "México conectado",
    2: "Conexión real",
    3: "Explorador gastronómico",
    4: "Equipo Sin Fronteras",
    5: "Sin fronteras",
    6: "Colaborador",
    7: "Estratega",
    8: "Explorador Nacional"
};

// 1. Registrar y completar un reto colaborativo
export async function completeChallenge(challengeId, badgeName, progressIncrease) {
    if (!auth.currentUser) {
        alert("Debes iniciar sesión para registrar el reto.");
        return;
    }

    const userId = auth.currentUser.uid;
    const userRef = doc(db, "usuarios", userId);

    try {
        let nuevoProgreso = Math.min(100, Math.round(userProgress + progressIncrease));

        // Guardar progreso en Firestore
        await updateDoc(userRef, {
            [`retos_completados.${challengeId}`]: true,
            progreso_porcentaje: nuevoProgreso
        });

        // Actualizar UI del botón
        const btn = document.querySelector(`#reto-${challengeId} button`);
        if (btn) {
            btn.innerText = "Sello Registrado ✅";
            btn.classList.add("completed");
            btn.disabled = true;
        }

        // Desbloquear y clonar insignia en el pasaporte
        desbloquearYClonarInsignia(badgeName);

        // Actualizar barras y contadores
        actualizarIndicadoresProgreso(nuevoProgreso);

        alert(`🎉 ¡Sello de la Semana ${challengeId} registrado con éxito en tu Pasaporte!`);

    } catch (error) {
        console.error("Error al registrar reto:", error);
        alert("Hubo un error al registrar tu avance.");
    }
}

// 2. Desbloquear medalla y colocarla en el Pasaporte
export function desbloquearYClonarInsignia(badgeName) {
    const badgeOriginal = document.getElementById(`badge-${badgeName}`);
    if (badgeOriginal) {
        badgeOriginal.classList.remove("locked");
        badgeOriginal.classList.add("unlocked");
    }

    const passportBadgesGrid = document.getElementById("passport-badges-grid");
    const noBadgesMsg = document.getElementById("no-badges-msg");
    
    if (passportBadgesGrid) {
        if (noBadgesMsg) noBadgesMsg.style.display = 'none';
        if (!document.getElementById(`clon-${badgeName}`) && badgeOriginal) {
            const clon = badgeOriginal.cloneNode(true);
            clon.id = `clon-${badgeName}`;
            passportBadgesGrid.appendChild(clon);
        }
    }
}

// 3. Sincronizar todos los números de la interfaz (Sidebar + Hero)
export function actualizarIndicadoresProgreso(nuevoProgreso) {
    userProgress = nuevoProgreso;

    // Sidebar
    const fillBar = document.getElementById("progress-fill");
    const progressText = document.getElementById("sidebar-progress-text");
    if (fillBar) fillBar.style.width = `${userProgress}%`;
    if (progressText) progressText.innerText = `${userProgress}%`;

    // Hero Banner KPIs
    const kpiProgreso = document.getElementById("kpi-progreso");
    if (kpiProgreso) kpiProgreso.innerText = `${userProgress}%`;
}

// 4. Cargar retos guardados al iniciar sesión
export function sincronizarRetosUsuario(datosUsuario) {
    if (!datosUsuario) return;

    if (datosUsuario.progreso_porcentaje) {
        actualizarIndicadoresProgreso(datosUsuario.progreso_porcentaje);
    }

    userStampsCount = 0;

    if (datosUsuario.retos_completados) {
        for (const [retoId, completado] of Object.entries(datosUsuario.retos_completados)) {
            if (completado) {
                const btn = document.querySelector(`#reto-${retoId} button`);
                if (btn) {
                    btn.innerText = "Sello Registrado ✅";
                    btn.classList.add("completed");
                    btn.disabled = true;
                }

                const badgeName = insigniasMapa[retoId];
                if (badgeName) {
                    desbloquearYClonarInsignia(badgeName);
                }
                userStampsCount++;
            }
        }
    }

    // Actualizar contador de sellos en el Hero Banner
    const kpiSellos = document.getElementById("kpi-sellos");
    if (kpiSellos) kpiSellos.innerText = userStampsCount;
}

// 5. Filtrar Misiones: Todas / Horizontal / Transversal
export function filterMissions(type, event) {
    const rows = document.querySelectorAll('.mission-row');
    const buttons = document.querySelectorAll('.filter-btn');

    buttons.forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    rows.forEach(row => {
        const rowType = row.getAttribute('data-type');
        if (type === 'all' || rowType === type) {
            row.style.display = 'grid';
        } else {
            row.style.display = 'none';
        }
    });
}