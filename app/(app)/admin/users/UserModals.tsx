"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { createUser, deleteUser, resendInvite, updateUser, type FormState } from "../actions";

export type UserRowData = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  isSelf: boolean;
};

/** Dev-only: the invite link, when mail is printed to the server log instead of being sent. */
function DevLink({ link }: { link: string }) {
  return (
    <div className="formok">
      Почта не настроена — письмо записано в лог сервера. Ссылку можно передать вручную:
      <code style={{ display: "block", wordBreak: "break-all", fontSize: 12, marginTop: 8 }}>{link}</code>
    </div>
  );
}

/** Runs onOk once per successful action result. */
function useOnOk(state: FormState, onOk: (s: NonNullable<FormState>) => void) {
  useEffect(() => { if (state?.ok) onOk(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(createUser, undefined);
  useOnOk(state, (s) => { toast(s.ok!); if (!s.link) onDone(); });

  if (state?.ok && state.link) {
    return (
      <>
        <DevLink link={state.link} />
        <div className="mfoot"><span className="spacer" /><button type="button" className="btn primary" onClick={onDone}>Готово</button></div>
      </>
    );
  }
  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="inv-email">E-mail <span className="req">*</span></label>
        <input id="inv-email" name="email" type="email" placeholder="masha@mail.ru" required />
      </div>
      <div className="grid cols2" style={{ gap: 14 }}>
        <div><label htmlFor="inv-first">Имя</label><input id="inv-first" name="firstName" placeholder="Маша" /></div>
        <div><label htmlFor="inv-last">Фамилия</label><input id="inv-last" name="lastName" /></div>
      </div>
      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label htmlFor="inv-role">Роль</label>
        <select id="inv-role" name="role" defaultValue="USER">
          <option value="USER">Пользователь</option>
          <option value="ADMIN">Администратор</option>
        </select>
      </div>
      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

export function InviteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>+ Добавить пользователя</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый пользователь"
        sub="Ссылка для установки пароля будет отправлена пользователю на почту.">
        {/* remount per opening so the form starts empty */}
        {open && <InviteForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function EditForm({ user, onDone }: { user: UserRowData; onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(updateUser, undefined);
  useOnOk(state, (s) => { toast(s.ok!); onDone(); });

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="userId" value={user.id} />
      <div className="field">
        <label htmlFor="ed-name">Имя</label>
        <input id="ed-name" name="name" defaultValue={user.name} required />
      </div>
      <div className="field">
        <label htmlFor="ed-role">Роль</label>
        <select id="ed-role" name="role" defaultValue={user.role}>
          <option value="USER">Пользователь</option>
          <option value="ADMIN">Администратор</option>
        </select>
      </div>
      <label className="toggle">
        <input type="checkbox" name="canLogin" defaultChecked={user.status !== "DISABLED"} />
        <span>Может входить</span>
      </label>
      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onDone}>Отмена</button>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

export function UserActions({ user }: { user: UserRowData }) {
  const toast = useToast();
  const [modal, setModal] = useState<"edit" | "del" | null>(null);
  const [delError, setDelError] = useState<string>();
  const [devLink, setDevLink] = useState<string>();
  const [pending, start] = useTransition();
  const close = () => { setModal(null); setDelError(undefined); };

  function resend() {
    start(async () => {
      const r = await resendInvite(user.id);
      if (r?.error) toast(r.error);
      else { toast(r!.ok!); setDevLink(r!.link); }
    });
  }
  function remove() {
    start(async () => {
      const r = await deleteUser(user.id);
      if (r?.error) setDelError(r.error);
      else { toast(r!.ok!); close(); }
    });
  }

  return (
    <>
      {user.status === "INVITED" && (
        <IconButton icon="send" title="Выслать приглашение снова" disabled={pending} onClick={resend} />
      )}
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setModal("edit")} />
      <IconButton icon="del" title={user.isSelf ? "Нельзя удалить самого себя" : "Удалить"} disabled={user.isSelf}
        onClick={() => setModal("del")} />

      <Modal open={modal === "edit"} onClose={close} title="Изменить пользователя" sub={user.email}>
        {modal === "edit" && <EditForm user={user} onDone={close} />}
      </Modal>
      <ConfirmModal open={modal === "del"} onClose={close} title="Удалить пользователя?" pending={pending} error={delError}
        text={<>«{user.name}» ({user.email}) будет удалён вместе со своими агентами, чеками и прогрессом.</>}
        onConfirm={remove} />
      <Modal open={!!devLink} onClose={() => setDevLink(undefined)} title="Приглашение отправлено повторно">
        {devLink && <DevLink link={devLink} />}
      </Modal>
    </>
  );
}
