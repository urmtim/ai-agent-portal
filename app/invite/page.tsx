import Link from "next/link";
import { findValidInvite } from "@/lib/invites";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await findValidInvite(token) : null;

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="authhead">
          <div className="brand" style={{ justifyContent: "center", fontSize: 18 }}>
            <span className="logo">С</span>
            Семейный портал
          </div>
          <h1 className="title" style={{ fontSize: 20, marginTop: 14 }}>
            Активация аккаунта
          </h1>
        </div>

        {invite ? (
          <SetPasswordForm
            token={token!}
            name={invite.user.name}
            email={invite.user.email}
          />
        ) : (
          <div className="card pad">
            <div className="formerr" style={{ marginBottom: 14 }}>
              Ссылка недействительна или устарела.
            </div>
            <p className="lead">
              Попросите администратора выслать новое приглашение.
            </p>
            <Link href="/login" className="btn ghost block" style={{ marginTop: 14 }}>
              На страницу входа
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
