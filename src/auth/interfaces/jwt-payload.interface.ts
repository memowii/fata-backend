export interface JwtPayload {
  sub: string; // User ID
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export interface JwtPayloadWithRefreshToken extends JwtPayload {
  refreshToken: string;
}