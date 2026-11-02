import { TituloSecao } from './secoes';

/*
 * Vídeo de vendas (VSL) da landing. Arquivos nossos em public/landing (feitos em Remotion, narração
 * gerada no ElevenLabs, trilha composta em código e efeitos CC0): nada de terceiros nem de CDN, então
 * vale o `media-src 'self'` da CSP. Sem autoplay (tem som): só baixa quando a pessoa aperta o play
 * (`preload="none"`), com poster e legenda em pt-BR. A proporção fixa evita salto de layout.
 */
export function VideoVendas() {
  return (
    <section
      id="video"
      className="relative scroll-mt-24 py-16 md:py-24"
      aria-labelledby="titulo-video"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <TituloSecao
          id="titulo-video"
          centro
          sobre="Em menos de um minuto e meio"
          titulo="Quantas vezes hoje você respondeu"
          destaque="a mesma pergunta?"
          texto="Veja como o Orkestra tira o orçamento repetido do seu WhatsApp e leva o cliente até a festa fechada. As telas do vídeo usam dados fictícios."
        />
        <div className="ld-vidro mx-auto mt-10 max-w-4xl overflow-hidden rounded-[28px] p-1.5 md:p-2">
          <video
            className="aspect-video w-full rounded-[22px] bg-black"
            controls
            playsInline
            preload="none"
            poster="/landing/vsl-orkestra-poster.webp"
            width={1920}
            height={1080}
            data-testid="video-vendas"
          >
            <source src="/landing/vsl-orkestra.webm" type="video/webm" />
            <source src="/landing/vsl-orkestra.mp4" type="video/mp4" />
            <track
              kind="captions"
              src="/landing/vsl-orkestra.vtt"
              srcLang="pt-BR"
              label="Português"
              default
            />
            Seu navegador não toca vídeo.{' '}
            <a href="/landing/vsl-orkestra.mp4">Baixe o vídeo</a>.
          </video>
        </div>
      </div>
    </section>
  );
}
