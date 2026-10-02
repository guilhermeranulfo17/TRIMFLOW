// Gera um par de chaves VAPID para o push (pnpm vapid:gerar). Cadastre na Vercel:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY = a pública
//   VAPID_PRIVATE_KEY            = a privada (secreta)
//   VAPID_SUBJECT                = mailto:seu-email (contato para os serviços de push)
// Trocar as chaves invalida as inscrições já feitas (cada aparelho precisa ativar de novo).
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:contato@seu-dominio.com.br');
