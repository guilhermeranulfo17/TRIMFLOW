'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, MessageCircle, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CampoPercentual, CampoTelefone } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { celularBRParaE164 } from '@/domain/phone';
import { novoVendedorSchema, type NovoVendedorEntrada } from '@/domain/validacao/usuario';
import { criarNovoVendedor } from '@/server/actions/empresa/usuarios';

type Criado = { nome: string; email: string; senha: string; whatsapp: string };

function linkWhatsApp(c: Criado): string {
  const login = `${window.location.origin}/login`;
  const texto =
    `Olá, ${c.nome.split(' ')[0]}! Seu acesso ao painel do buffet no Orkestra:\n` +
    `${login}\nE-mail: ${c.email}\nSenha temporária: ${c.senha}\n` +
    `No primeiro acesso você vai criar sua própria senha.`;
  const numero = (celularBRParaE164(c.whatsapp) ?? '').replace('+', '');
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const VAZIO: NovoVendedorEntrada = { nome: '', email: '', whatsapp: '', limiteDescontoBp: 0 };

export function NovoVendedor() {
  const toast = useToast();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [salvando, iniciar] = useTransition();
  const form = useForm<NovoVendedorEntrada>({
    resolver: zodResolver(novoVendedorSchema),
    defaultValues: VAZIO,
  });
  const e = form.formState.errors;

  const fechar = (v: boolean) => {
    if (salvando) return;
    setAberto(v);
    if (!v) {
      setCriado(null);
      setCopiado(false);
      form.reset(VAZIO);
    }
  };

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await criarNovoVendedor(valores);
      if (r.ok && r.dados) {
        toast.sucesso(r.mensagem);
        setCriado({ nome: valores.nome, whatsapp: valores.whatsapp, ...r.dados });
        router.refresh();
      } else if (!r.ok) {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <>
      <Button type="button" onClick={() => setAberto(true)}>
        <UserPlus aria-hidden />
        Novo vendedor
      </Button>
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent>
          {criado ? (
            <>
              <DialogHeader>
                <DialogTitle>Vendedor criado</DialogTitle>
                <DialogDescription>
                  Envie o acesso para {criado.nome}. A senha temporária aparece só agora; no
                  primeiro acesso, o vendedor cria a própria senha.
                </DialogDescription>
              </DialogHeader>
              <dl className="rounded-card bg-muted space-y-2 p-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="font-medium break-all">{criado.email}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Senha temporária</dt>
                  <dd
                    className="font-mono text-lg font-bold tracking-wider"
                    data-testid="senha-temporaria"
                  >
                    {criado.senha}
                  </dd>
                </div>
              </dl>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(criado.senha).catch(() => {});
                    setCopiado(true);
                    toast.sucesso('Senha copiada.');
                  }}
                >
                  {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
                  Copiar senha
                </Button>
                <Button asChild>
                  <a href={linkWhatsApp(criado)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden />
                    Enviar pelo WhatsApp
                  </a>
                </Button>
                <Button type="button" variant="ghost" onClick={() => fechar(false)}>
                  Concluir
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Novo vendedor</DialogTitle>
                <DialogDescription>
                  O vendedor entra com e-mail e uma senha temporária que vamos gerar.
                </DialogDescription>
              </DialogHeader>
              <fieldset disabled={salvando} className="space-y-4">
                <Campo id="vendedor-nome" rotulo="Nome" erro={e.nome?.message}>
                  <Input id="vendedor-nome" autoComplete="off" {...form.register('nome')} />
                </Campo>
                <Campo id="vendedor-email" rotulo="E-mail" erro={e.email?.message}>
                  <Input
                    id="vendedor-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    {...form.register('email')}
                  />
                </Campo>
                <Campo id="vendedor-whatsapp" rotulo="WhatsApp" erro={e.whatsapp?.message}>
                  <Controller
                    control={form.control}
                    name="whatsapp"
                    render={({ field }) => (
                      <CampoTelefone
                        id="vendedor-whatsapp"
                        valor={field.value}
                        onChange={field.onChange}
                        invalido={!!e.whatsapp}
                      />
                    )}
                  />
                </Campo>
                <Campo
                  id="vendedor-limite"
                  rotulo="Limite de desconto"
                  dica="Até quanto o vendedor pode dar de desconto num orçamento (0% a 100%)."
                  erro={e.limiteDescontoBp?.message}
                >
                  <Controller
                    control={form.control}
                    name="limiteDescontoBp"
                    render={({ field }) => (
                      <CampoPercentual
                        id="vendedor-limite"
                        valor={field.value}
                        onChange={(v) => field.onChange(v ?? Number.NaN)}
                        className="w-28"
                      />
                    )}
                  />
                </Campo>
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => fechar(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Criando…' : 'Criar vendedor'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
