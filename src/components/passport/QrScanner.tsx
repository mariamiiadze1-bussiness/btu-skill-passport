import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";

/** Pulls the verification code out of a scanned QR: a /verify?code=… link or the bare code. */
export function codeFromQr(text: string) {
  try {
    const url = new URL(text);
    return url.searchParams.get("code") ?? "";
  } catch {
    return text.trim();
  }
}

export function QrScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const scan = () => {
      const video = videoRef.current;
      if (stopped || !video || !context) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        const result = jsQR(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        );
        if (result?.data) {
          onCode(codeFromQr(result.data));
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((media) => {
        if (stopped) return media.getTracks().forEach((track) => track.stop());
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          void videoRef.current.play();
        }
        frame = requestAnimationFrame(scan);
      })
      .catch(() => setError("Camera access was blocked. Type the code instead."));
    if (!navigator.mediaDevices)
      setError("This browser cannot use the camera. Type the code instead.");

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode]);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border-2 border-foreground bg-foreground">
      {error ? (
        <p role="alert" className="p-5 text-sm font-semibold text-background">
          {t(error)}
        </p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label={t("Camera preview for QR scanning")}
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {t("Point the camera at the QR code on the passport.")}
        </p>
        <button type="button" onClick={onClose} className="text-xs font-bold uppercase underline">
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
