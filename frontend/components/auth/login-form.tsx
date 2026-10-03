import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import styles from "./login-layout.module.css";

interface LoginFormProps {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
}

export function LoginForm(props: LoginFormProps) {
  const passwordInput = useRef<HTMLInputElement>(null);
  const canContinue = props.email.trim() !== "" && (!props.showPassword || props.password !== "");

  useEffect(() => {
    if (props.showPassword) passwordInput.current?.focus();
  }, [props.showPassword]);

  return (
    <section aria-labelledby="login-title" className={styles.form}>
      <h1 id="login-title" className={styles.title}>Converse.<br />Conquiste.</h1>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.loading) void props.onSubmit();
        }}
        aria-busy={props.loading}
        className={styles.fields}
      >
        <button
          type="button"
          disabled={props.loading}
          onClick={() => void props.onGoogleSignIn()}
          className={`${styles.button} ${styles.socialButton}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.googleIcon}>
            <path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
            <path fill="currentColor" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
            <path fill="currentColor" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" />
            <path fill="currentColor" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z" />
          </svg>
          Continuar com Google
        </button>

        <div className={styles.divider}><span />ou<span /></div>

        <div>
          <label htmlFor="login-email" className={styles.srOnly}>E-mail</label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={props.loading}
            placeholder="Seu endereço de e-mail"
            value={props.email}
            onChange={(event) => props.onEmailChange(event.target.value)}
            aria-invalid={props.error ? true : undefined}
            aria-describedby={props.error ? "login-error" : undefined}
            className={styles.input}
          />
        </div>

        {props.showPassword && (
          <div>
            <label htmlFor="login-password" className={styles.srOnly}>Senha</label>
            <input
              ref={passwordInput}
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={props.loading}
              placeholder="Sua senha"
              value={props.password}
              onChange={(event) => props.onPasswordChange(event.target.value)}
              aria-invalid={props.error ? true : undefined}
              aria-describedby={props.error ? "login-error" : undefined}
              className={styles.input}
            />
          </div>
        )}

        {props.error && <p id="login-error" role="alert" className={styles.error}>{props.error}</p>}

        <button
          type="submit"
          disabled={props.loading || !canContinue}
          className={`${styles.button} ${styles.continueButton}`}
        >
          {props.loading && <LoaderCircle aria-hidden="true" className={styles.spinner} />}
          {props.loading ? "Entrando..." : "Continuar"}
        </button>
      </form>

      <p className={styles.footer}>Acesse sua conta para continuar no <strong>CotrimBot.</strong></p>
    </section>
  );
}
