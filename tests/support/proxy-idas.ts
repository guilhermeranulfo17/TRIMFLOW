import net from 'node:net';

/*
 * Proxy TCP que conta IDAS AO BANCO (round trips) de verdade, independente do driver: cada vez
 * que o cliente manda dados depois de ter recebido resposta (ou no começo), conta uma ida.
 * Mensagens mandadas juntas (pipeline, várias instruções num pacote) contam como uma.
 * Conexões em paralelo somam. Só para testes.
 */
export type ProxyIdas = {
  url: string;
  idas: () => number;
  zerar: () => void;
  fechar: () => Promise<void>;
};

export async function criarProxyIdas(destino: string): Promise<ProxyIdas> {
  const alvo = new URL(destino);
  let idas = 0;
  const sockets = new Set<net.Socket>();
  const servidor = net.createServer((cliente) => {
    const banco = net.connect(Number(alvo.port || 5432), alvo.hostname);
    sockets.add(cliente).add(banco);
    let aguardando = false;
    cliente.on('data', (d) => {
      if (!aguardando) {
        idas++;
        aguardando = true;
      }
      banco.write(d);
    });
    banco.on('data', (d) => {
      aguardando = false;
      cliente.write(d);
    });
    const fim = () => {
      cliente.destroy();
      banco.destroy();
    };
    cliente.on('close', fim).on('error', fim);
    banco.on('close', fim).on('error', fim);
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const porta = (servidor.address() as net.AddressInfo).port;
  const url = new URL(destino);
  url.hostname = '127.0.0.1';
  url.port = String(porta);
  return {
    url: url.toString(),
    idas: () => idas,
    zerar: () => {
      idas = 0;
    },
    fechar: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => servidor.close(() => r()));
    },
  };
}
