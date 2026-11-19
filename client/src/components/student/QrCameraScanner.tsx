import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { AR } from '../../constants/ar';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
}

interface QrCameraScannerProps {
  onDetected: (rawValue: string) => void;
}

/**
 * In-website QR scanning for the student check-in page: opens the device camera and
 * decodes the organizer's rotating QR with the browser's native BarcodeDetector
 * (Chrome / Android). Browsers without it keep the manual paste flow, with the
 * unsupported note that was already in the copy deck.
 */
export function QrCameraScanner({ onDetected }: QrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState('');

  function stopCamera() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function startCamera() {
    const Detector = getBarcodeDetectorConstructor();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setNotice(AR.studentPortal.checkin.cameraUnsupported);
      return;
    }
    setNotice('');
    detectedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      // Wait for the <video> element to mount before attaching the stream.
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const detector = new Detector({ formats: ['qr_code'] });
      timerRef.current = window.setInterval(() => {
        void detector
          .detect(video)
          .then((codes) => {
            const raw = codes[0]?.rawValue?.trim();
            if (raw && !detectedRef.current) {
              detectedRef.current = true;
              stopCamera();
              onDetected(raw);
            }
          })
          .catch(() => undefined);
      }, 300);
    } catch {
      stopCamera();
      setNotice(AR.studentPortal.checkin.cameraError);
    }
  }

  return (
    <div className="space-y-3">
      {scanning ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            data-testid="qr-camera-video"
            muted
            playsInline
            className="w-full rounded-2xl border border-slate-200 bg-black aspect-[4/3] object-cover"
          />
          <p className="text-[11px] font-bold text-slate-500">
            {AR.studentPortal.checkin.cameraHint}
          </p>
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <CameraOff className="w-4 h-4" />
            <span>{AR.studentPortal.checkin.stopCameraBtn}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void startCamera()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>{AR.studentPortal.checkin.scanCameraBtn}</span>
        </button>
      )}
      {notice && (
        <p role="alert" className="text-[11px] font-bold text-amber-700">
          {notice}
        </p>
      )}
    </div>
  );
}
