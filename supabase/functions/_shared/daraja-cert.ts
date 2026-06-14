// Safaricom Daraja public keys (production + sandbox).
// Used to encrypt the InitiatorPassword into the SecurityCredential at runtime,
// so we never depend on a pre-baked DARAJA_B2C_SECURITY_CREDENTIAL that goes
// stale whenever the API user's password is rotated on the Daraja portal.

export const DARAJA_PROD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoknIb5Tm1hxOVdFsOejA
s6veAai32Zv442BLuOGkFKUeCUM2s0K8XEsUt6BP25rQGNlTCTEqfdtRrym6bt5k
0fTDscf0yMCoYzaxTh1mejg8rPO6bD8MJB0cFWRUeLEyWjMeEPsYVSJFv7T58IdA
n7/RhkrpBl1dT7SmIZfNVkIlD35+Cxgab+u7+c7dHh6mWguEEoE3NbV7Xjl60zbD
/Buvmu6i9EYz+27jNVPI6pRXHvp+ajIzTSsieD8Ztz1eoC9mphErasAGpMbR1sba
9bM6hjw4tyTWnJDz7RdQQmnsW1NfFdYdK0qDRKUX7SG6rQkBqVhndFve4SDFRq6w
vQIDAQAB
-----END PUBLIC KEY-----`;

export const DARAJA_SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqLcFdVcV7HdEOotsNLoM
PhD74CX1ejzcgfNuiJNy9pTySxbszRBCWxmok3Unul4rX/zyVD/6vDb9nbqRywZI
gR46UOn+tR3vGXXPX6igxgS6DYTaQV8W858yOGLuoYwRi5xeQJfczAMU4o+sCxlB
bMCqYs4nzW81fi8iF2OEUdrfJcbamhSnksdgfD/nomWy9MESAz1QufrOBnaRX2N0
CKsi8SNmzsghpfP15VLiIVV8YXPFKtd9sY37FpY28OKGjKG5wdije/bzFL8qEcPD
hqYGuVaGkhX1bkI0iH+UcFtYYrZv/Fyb5jRHXmNLiq4mMG0fMH8ENxNACFtRZTDI
IQIDAQAB
-----END PUBLIC KEY-----`;

export function darajaPublicKey(): string {
  const env = (Deno.env.get("DARAJA_ENV") ?? "production").toLowerCase();
  return env === "sandbox" ? DARAJA_SANDBOX_PUBLIC_KEY : DARAJA_PROD_PUBLIC_KEY;
}
