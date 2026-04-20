import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UsuarioActual = createParamDecorator(
  (data: keyof UsuarioToken | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: UsuarioToken }>();
    const usuario = request.user;
    return data ? usuario?.[data] : usuario;
  },
);

export interface UsuarioToken {
  sub: string;
  correo: string;
  nombre_visible: string;
}
