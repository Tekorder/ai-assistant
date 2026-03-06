import {
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@getbrevo/brevo";

export function brevoTx() {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is not defined");
  }

  const api = new TransactionalEmailsApi();
  api.setApiKey(TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

  return api;
}
