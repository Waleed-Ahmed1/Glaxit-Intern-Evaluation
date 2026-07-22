import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        throw new Error(
            'SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured'
        );
    }

    const secure = process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === 'true'
        : port === 465;

    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });

    return transporter;
}

function buildOtpTemplate(otp) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >
    <title>Glaxit Verification Code</title>
</head>

<body
    style="
        margin:0;
        padding:0;
        background:#ffffff;
        font-family:Arial,Helvetica,sans-serif;
        color:#1a1a1a;
    "
>
    <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        border="0"
        style="background:#ffffff;padding:32px 12px;"
    >
        <tr>
            <td align="center">

                <table
                    role="presentation"
                    width="100%"
                    cellspacing="0"
                    cellpadding="0"
                    border="0"
                    style="
                        max-width:660px;
                        background:#ffffff;
                        border-radius:22px;
                        overflow:hidden;
                        border:1px solid #e4e6ea;
                        box-shadow:0 2px 10px rgba(0,0,0,0.06);
                    "
                >
                    <tr>
                        <td
                            style="
                                padding:44px 32px 18px;
                                text-align:center;
                            "
                        >
                            <div
                                style="
                                    display:inline-block;
                                    padding:8px 14px;
                                    border-radius:999px;
                                    background:#eaf1ff;
                                    color:#2563eb;
                                    font-size:12px;
                                    font-weight:700;
                                    letter-spacing:1.4px;
                                    text-transform:uppercase;
                                "
                            >
                                Glaxit Security
                            </div>

                            <h1
                                style="
                                    margin:20px 0 0;
                                    font-size:28px;
                                    line-height:1.25;
                                    color:#111214;
                                    font-weight:700;
                                "
                            >
                                Glaxit Verification Code
                            </h1>
                        </td>
                    </tr>

                    <tr>
                        <td
                            style="
                                padding:0 32px;
                                text-align:center;
                            "
                        >
                            <p
                                style="
                                    margin:0;
                                    color:#5b6472;
                                    font-size:16px;
                                    line-height:1.7;
                                "
                            >
                                Your one-time registration verification code is:
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td
                            align="center"
                            style="padding:34px 24px;"
                        >
                            <div
                                style="
                                    display:inline-block;
                                    background:#f4f6f9;
                                    border:1px solid #d7dce3;
                                    border-radius:12px;
                                    padding:20px 28px;
                                    color:#2563eb;
                                    font-size:44px;
                                    line-height:1;
                                    font-weight:800;
                                    letter-spacing:12px;
                                    font-family:'Courier New',Courier,monospace;
                                "
                            >
                                ${otp}
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td
                            style="
                                padding:8px 38px 42px;
                                text-align:center;
                            "
                        >
                            <p
                                style="
                                    margin:0;
                                    color:#616875;
                                    font-size:15px;
                                    line-height:1.65;
                                "
                            >
                                This code is valid for exactly
                                <strong style="color:#111214;">
                                    2 minutes
                                </strong>.

                                If you did not request this account
                                registration, please ignore this email.
                            </p>

                            <div
                                style="
                                    height:1px;
                                    background:#e4e6ea;
                                    margin:30px 0 22px;
                                "
                            ></div>

                            <p
                                style="
                                    margin:0;
                                    color:#8b919c;
                                    font-size:12px;
                                    line-height:1.6;
                                "
                            >
                                Never share this verification code with
                                anyone. Glaxit staff will never ask you
                                for it.
                            </p>
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>
</body>
</html>`;
}

export async function sendRegistrationOtpEmail({
    to,
    otp,
}) {
    const smtpUser = process.env.SMTP_USER;

    const from =
        process.env.EMAIL_FROM ||
        `"Glaxit" <${smtpUser}>`;

    return getTransporter().sendMail({
        from,
        to,
        subject: 'Glaxit verification code',

        text: [
            'Glaxit Verification Code',
            '',
            `Your one-time registration verification code is: ${otp}`,
            '',
            'This code is valid for exactly 2 minutes.',
            'If you did not request this account registration, please ignore this email.',
        ].join('\n'),

        html: buildOtpTemplate(otp),
    });
}