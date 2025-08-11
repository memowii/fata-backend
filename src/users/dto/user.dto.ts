import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserDto {
  @ApiProperty({
    example: 'cm5xk8l9x0000rqzk8nqo5321',
    description: 'User unique identifier',
  })
  @Expose()
  id: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @Expose()
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'User full name',
  })
  @Expose()
  name: string;

  @ApiProperty({
    example: true,
    description: 'Email verification status',
  })
  @Expose()
  emailVerified: boolean;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Account creation timestamp',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Last update timestamp',
  })
  @Expose()
  updatedAt: Date;

  // Exclude sensitive fields
  passwordHash: string;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  failedLoginAttempts?: number;
  lockedUntil?: Date;

  constructor(partial: Partial<UserDto>) {
    Object.assign(this, partial);
  }
}