import { sendEmail } from '../email/resend';
import {
  sendAuthInvitationEmail,
  sendAuthMagicLink,
  sendAuthVerificationOTP,
} from './auth-email';

jest.mock('../email/resend', () => ({ sendEmail: jest.fn() }));
jest.mock('@trycompai/email', () => ({
  MagicLinkEmail: jest.fn(() => 'magic link email'),
  OTPVerificationEmail: jest.fn(() => 'OTP email'),
}));
jest.mock('../email/templates/invite-member', () => ({
  InviteEmail: jest.fn(() => 'invitation email'),
}));
jest.mock('@trigger.dev/sdk', () => {
  throw new Error('Authentication email must not depend on Trigger');
});

describe('authentication email delivery without Trigger', () => {
  const email = 'member@example.com';
  const send = jest.mocked(sendEmail);

  beforeEach(() => send.mockReset());

  it.each([
    {
      subject: 'Login to Betayum',
      deliver: () =>
        sendAuthMagicLink({ email, url: 'https://api.example.com/verify' }),
    },
    {
      subject: 'One-Time Password for Betayum',
      deliver: () => sendAuthVerificationOTP({ email, otp: '123456' }),
    },
    {
      subject: "You've been invited to join Example on Betayum",
      deliver: () =>
        sendAuthInvitationEmail({
          email,
          organization: { name: 'Example' },
          invitation: { id: 'invite_1' },
        }),
    },
  ])(
    'sends $subject directly through the system email sender',
    async ({ subject, deliver }) => {
      await deliver();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ to: email, subject, system: true }),
      );
    },
  );

  it('propagates delivery failures so auth never claims an email was sent', async () => {
    send.mockRejectedValue(new Error('Email provider unavailable'));
    await expect(
      sendAuthMagicLink({ email, url: 'https://api.example.com/verify' }),
    ).rejects.toThrow('Email provider unavailable');
  });
});
