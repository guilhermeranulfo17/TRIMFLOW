'use client';

import { useEffect, useRef } from 'react';

/**
 * Vídeo do fundo das telas de acesso (arquivo nosso em public/acesso, sem som). Com movimento
 * reduzido ou economia de dados, fica parado na primeira imagem (poster).
 */
export function VideoFundo({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const economia = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (economia || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      video.removeAttribute('autoplay');
      return;
    }
    // alguns navegadores só tocam depois de pedir de novo
    video.play().catch(() => {});
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster="/acesso/fundo.webp"
      aria-hidden
      tabIndex={-1}
      disablePictureInPicture
    >
      <source src="/acesso/fundo.webm" type="video/webm" />
      <source src="/acesso/fundo.mp4" type="video/mp4" />
    </video>
  );
}
