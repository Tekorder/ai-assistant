'use client';

/**
 * Sign Up Page
 * Following BEST_PRACTICES.md:
 * - Component size < 250 lines
 * - Organized imports (external → internal hooks → components → utils)
 * - Type safety with explicit types
 * - Separation of concerns (validation, API logic extracted)
 */

// External libraries
import { useState } from 'react';
import Link from 'next/link';

// Internal hooks
import { useSignUp } from './_hook/useSignUp';

// Components
import FormField from './components/FormField';
import ValidationMessage from './components/ValidationMessage';
import { useRouter } from "next/navigation";


// Utilities
import {
  validateUsername,
  validateDisplayName,
  validateEmail,
  validatePasswordMatch,
  validatePassword,
} from './_utils/validation';

export default function SignUpPage() {
  // Form state
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation state
  const [usernameError, setUsernameError] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordMatch, setShowPasswordMatch] = useState(false);

  const router = useRouter();


  // Sign up hook
  const { isLoading, error: signUpError } = useSignUp();

  // Validation handlers
  const handleUsernameChange = (value: string): void => {
    setUsername(value);
    const result = validateUsername(value);
    setUsernameError(result.error);
  };

  const handleDisplayNameChange = (value: string): void => {
    setDisplayName(value);
    const result = validateDisplayName(value);
    setDisplayNameError(result.error);
  };

  const handleEmailChange = (value: string): void => {
    setEmail(value);
    const result = validateEmail(value);
    setEmailError(result.error);
  };

  const handlePasswordChange = (value: string): void => {
    setPassword(value);
    const passwordResult = validatePassword(value);

    if (confirmPassword.length > 0) {
      const matchResult = validatePasswordMatch(value, confirmPassword);
      setPasswordError(passwordResult.error || matchResult.error);
      setShowPasswordMatch(true);
    }
  };

  const handleConfirmPasswordChange = (value: string): void => {
    setConfirmPassword(value);
    setShowPasswordMatch(true);
    const result = validatePasswordMatch(password, value);
    setPasswordError(result.error);
  };

  // Form validation
  const isFormValid = (): boolean => {
    return !!(
      username &&
      displayName &&
      email &&
      password &&
      confirmPassword &&
      !usernameError &&
      !displayNameError &&
      !emailError &&
      !passwordError &&
      password.length >= 6
    );
  };

  // Form submission
 /*
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {


    e.preventDefault();

    // Final validation
    const usernameResult = validateUsername(username);
    const displayNameResult = validateDisplayName(displayName);
    const emailResult = validateEmail(email);
    const passwordMatchResult = validatePasswordMatch(password, confirmPassword);

    if (!usernameResult.isValid) {
      setUsernameError(usernameResult.error);
      return;
    }

    if (!displayNameResult.isValid) {
      setDisplayNameError(displayNameResult.error);
      return;
    }

    if (!emailResult.isValid) {
      setEmailError(emailResult.error);
      return;
    }

    if (!passwordMatchResult.isValid) {
      setPasswordError(passwordMatchResult.error);
      return;
    }

    if (password.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
        await signUp({ username, displayName, email, password });
            const res = await fetch("/api/brevo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "send_email",
                  email: email,
                  template: "welcome",
                  displayName: displayName,
                  username: username,
                  data: {}
                })
        });
    } catch {
      // Error is handled by the hook
    }
  }; */


  const handleSubmit = async (e: React.FormEvent): Promise<void> => {

  e.preventDefault();

  // Validación mínima para no mandar basura
  const emailResult = validateEmail(email);
  if (!emailResult.isValid) {
    setEmailError(emailResult.error);
    return;
  }


 
  try {
    const res = await fetch("/api/brevo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_email",
            email: "joseandres.suazo@gmail.com",
            template: "welcome",
            displayName: displayName,
            username: username,
            data: {}
          })
        });

    const out = await res.json().catch(() => ({}));

    if (!res.ok || !out.ok) {
      alert(out.message || "Error enviando correo");
      return;
    }

    alert("The registration was succesfull! Log in with your email and password.")

    router.push("/login");


 
  } catch (err) {
    console.log(err);
  }
}; 

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Bienvenido a <span className="text-purple-400">Youtask</span>
          </h1>
          <p className="text-gray-400">Crea tu cuenta para comenzar</p>
        </div>

        {/* Form */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              label="Username"
              type="text"
              placeholder="usuario123"
              value={username}
              onChange={handleUsernameChange}
              error={usernameError}
              showValidation={true}
              successMessage="Username válido (3-20 caracteres, sin espacios)"
              required
            />

            <FormField
              label="Display Name"
              type="text"
              placeholder="Juan Pérez"
              value={displayName}
              onChange={handleDisplayNameChange}
              error={displayNameError}
              showValidation={true}
              successMessage="Nombre válido (3-25 caracteres)"
              required
            />

            <FormField
              label="Email"
              type="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={handleEmailChange}
              error={emailError}
              showValidation={true}
              successMessage="Email válido"
              required
            />

            <FormField
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={handlePasswordChange}
              helpText="Mínimo 6 caracteres"
              required
              minLength={6}
            />

            <FormField
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              error={passwordError}
              showValidation={showPasswordMatch}
              successMessage="Las contraseñas coinciden"
              required
            />

            {/* Sign up error */}
            {signUpError && (
              <ValidationMessage type="error" message={signUpError} />
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={!isFormValid() || isLoading}
              className={`w-full py-3 px-4 rounded-md font-semibold transition-all duration-200 ${
                !isFormValid() || isLoading
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95'
              }`}
            >
              {isLoading ? 'Registrando...' : 'Crear cuenta'}
            </button>
          </form>

          {/* Login link */}
          <p className="text-sm text-gray-400 mt-6 text-center">
            ¿Ya tienes una cuenta?{' '}
            <Link href="/login" className="text-purple-400 hover:text-purple-300">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
