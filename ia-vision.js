// Variable global para el modelo TensorFlow
let aiModel = null;

// Cargar MobileNet en segundo plano
if (window.mobilenet) {
    mobilenet.load().then(model => {
        aiModel = model;
        console.log("✅ IA MobileNet cargada con éxito en segundo plano.");
    }).catch(err => console.error("Error cargando MobileNet:", err));
}

// 1. Compresor de imágenes en Canvas (evita superar el límite de Firebase)
export function comprimirImagen(base64Str, maxWidth = 600) {
    return new Promise((resolve) => {
        let img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height *= maxWidth / width));
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7)); 
        };
    });
}

// 2. Clasificador de comida para validar en automático el Reto 3
export async function detectarComidaConIA(imgElement) {
    if (!aiModel) return false;
    try {
        const predictions = await aiModel.classify(imgElement);
        const foodKeywords = ['food', 'dish', 'plate', 'meal', 'restaurant', 'fruit', 'vegetable', 'meat', 'bread', 'pizza', 'taco', 'guacamole', 'soup'];
        return predictions.some(pred => 
            foodKeywords.some(keyword => pred.className.toLowerCase().includes(keyword))
        );
    } catch (e) {
        console.error("Error clasificando con IA:", e);
        return false;
    }
}

// 3. Manejo de la Cámara Web
let mediaStream = null;
const webcamModal = document.getElementById('webcam-modal');
const webcamVideo = document.getElementById('webcam-video');

export async function abrirCamaraWeb() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (webcamVideo) {
            webcamVideo.srcObject = mediaStream;
            webcamModal.style.display = 'flex';
        }
    } catch (err) {
        alert("Por favor permite el acceso a la cámara en tu navegador.");
    }
}

export function cerrarCamaraWeb() {
    if (webcamModal) webcamModal.style.display = 'none';
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

export function capturarFotoWebcam() {
    if (!webcamVideo) return null;
    const canvas = document.createElement('canvas');
    canvas.width = webcamVideo.videoWidth;
    canvas.height = webcamVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
    cerrarCamaraWeb();
    return canvas.toDataURL('image/jpeg', 0.85);
}