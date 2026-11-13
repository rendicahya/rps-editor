<script>
  import { tick } from 'svelte';
  import { asks, answer } from './ask.svelte.js';
  import { dismiss } from './dismiss.js';

  let dialog;
  let input = $state();
  let okBtn = $state();
  let value = $state('');
  const req = $derived(asks.queue[0]);

  $effect(() => {
    const r = req;
    if (r) {
      value = r.value ?? '';
      if (!dialog.open) dialog.showModal();
      tick().then(() => {
        if (r !== asks.queue[0]) return;
        if (r.kind === 'prompt') input?.select();
        else okBtn?.focus();
      });
    } else if (dialog.open) dialog.close();
  });

  const cancelValue = () => (req?.kind === 'prompt' ? null : req?.kind === 'confirm' ? false : undefined);
  function ok(e) {
    e.preventDefault();
    if (req) answer(req.kind === 'prompt' ? value : req.kind === 'confirm' ? true : undefined);
  }
  function cancel(e) {
    e?.preventDefault();
    if (req) answer(cancelValue());
  }
</script>

<dialog bind:this={dialog} class="dialog ask" use:dismiss={cancel} oncancel={cancel}>
  {#if req}
    <form onsubmit={ok}>
      {#if req.title}<h2>{req.title}</h2>{/if}
      {#if req.kind === 'prompt'}
        <label>
          <span class="msg">{req.message}</span>
          <input bind:this={input} bind:value type={req.type ?? 'text'} maxlength={req.maxlength} />
        </label>
      {:else}
        <p class="msg">{req.message}</p>
      {/if}
      <footer>
        {#if req.kind !== 'alert'}
          <button type="button" class="btn" onclick={cancel}>{req.cancel ?? 'Batal'}</button>
        {/if}
        <button bind:this={okBtn} class="btn primary" class:danger={req.danger}>{req.ok ?? 'OK'}</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(440px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  .msg {
    display: block;
    margin: 0 0 0.9rem;
    line-height: 1.5;
    font-size: 0.9rem;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  label .msg {
    margin-bottom: 0.4rem;
  }
  input {
    margin-bottom: 0.9rem;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  .btn.primary.danger {
    background: var(--danger);
    border-color: var(--danger);
  }
</style>
