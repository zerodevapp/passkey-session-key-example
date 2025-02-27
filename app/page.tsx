"use client";

import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import {
  PasskeyValidatorContractVersion,
  WebAuthnMode,
  toPasskeyValidator,
  toWebAuthnKey,
} from "@zerodev/passkey-validator";
import { toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import React, { useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
const BUNDLER_URL = `https://rpc.zerodev.app/api/v2/bundler/${projectId}`;
const PAYMASTER_URL = `https://rpc.zerodev.app/api/v2/paymaster/${projectId}`;
const PASSKEY_SERVER_URL = `https://passkeys.zerodev.app/api/v3/${projectId}`;

const CHAIN = sepolia;
const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

const sessionPrivateKey = generatePrivateKey();
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);

const publicClient = createPublicClient({
  transport: http(),
  chain: CHAIN,
});

let sessionKeyAccount: any;
let kernelClient: any;

export default function Home() {
  // State to store the input value
  const [username, setUsername] = useState("");
  const [accountAddress, setAccountAddress] = useState("");
  const [isKernelClientReady, setIsKernelClientReady] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSendingUserOp, setIsSendingUserOp] = useState(false);
  const [userOpHash, setUserOpHash] = useState("");
  const [userOpStatus, setUserOpStatus] = useState("");
  const [userOpCount, setUserOpCount] = useState(0);

  const createAccountAndClient = async (passkeyValidator: any) => {
    const ecdsaSigner = await toECDSASigner({
      signer: sessionKeySigner,
    });

    const sudoPolicy = await toSudoPolicy({});

    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: ecdsaSigner,
      policies: [sudoPolicy],
      entryPoint,
      kernelVersion,
    });

    sessionKeyAccount = await createKernelAccount(publicClient, {
      entryPoint,
      kernelVersion,
      plugins: {
        sudo: passkeyValidator,
        regular: permissionValidator,
      },
    });

    kernelClient = createKernelAccountClient({
      account: sessionKeyAccount,
      chain: CHAIN,
      bundlerTransport: http(BUNDLER_URL),
      paymaster: {
        getPaymasterData: async (userOperation) => {
          const zeroDevPaymaster = await createZeroDevPaymasterClient({
            chain: CHAIN,
            transport: http(PAYMASTER_URL),
          });
          return zeroDevPaymaster.sponsorUserOperation({
            userOperation,
          });
        },
      },
    });

    setIsKernelClientReady(true);
    setAccountAddress(sessionKeyAccount.address);
  };

  // Function to be called when "Register" is clicked
  const handleRegister = async () => {
    console.log("Registering with username:", username);
    setIsRegistering(true);

    const webAuthnKey = await toWebAuthnKey({
      passkeyName: username,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Register,
    });

    const passkeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey,
      kernelVersion,
      entryPoint,
      validatorContractVersion: PasskeyValidatorContractVersion.V0_0_2,
    });

    await createAccountAndClient(passkeyValidator);

    setIsRegistering(false);
    window.alert("Register done.  Try sending UserOps.");
  };

  // Function to be called when "Login" is clicked
  const handleLogin = async () => {
    console.log("Logging in with username:", username);
    setIsLoggingIn(true);

    const webAuthnKey = await toWebAuthnKey({
      passkeyName: username,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Login,
    });

    const passkeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey,
      entryPoint,
      kernelVersion,
      validatorContractVersion: PasskeyValidatorContractVersion.V0_0_2,
    });

    await createAccountAndClient(passkeyValidator);

    setIsLoggingIn(false);
    window.alert("Login done.  Try sending UserOps.");
  };

  const handleSendUserOp = async () => {
    setIsSendingUserOp(true);
    setUserOpStatus("Sending UserOp...");
    console.log("Sending userop with username:", username);

    const userOpHash = await kernelClient.sendUserOperation({
      callData: await sessionKeyAccount.encodeCalls([{
        to: "0x0000000000000000000000000000000000000000",
        value: BigInt(0),
        data: "0x",
      }]),
    });

    setUserOpHash(userOpHash);
    console.log("waiting for userOp:", userOpHash);

    await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    setUserOpCount(userOpCount + 1);

    // Update the message based on the count of UserOps
    const userOpMessage =
      userOpCount === 0
        ? `First UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=sepolia" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a> <br> Now try sending another UserOp.`
        : `UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=sepolia" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a> <br> Notice how this UserOp costs a lot less gas and requires no prompting.`;

    setUserOpStatus(userOpMessage);
    setIsSendingUserOp(false);
  };

  return (
    <>
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-6xl">
          <h1 className="text-4xl font-semibold text-center mb-12">
            ZeroDev Passkeys + Session Keys Demo
          </h1>
          <div className="grid grid-cols-2 gap-12">
            <div className="text-lg">
              <p>
                This demo showcases the ZeroDev{" "}
                <a
                  href="https://docs.zerodev.app/sdk/plugins/passkeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700"
                >
                  progressive passkey validator
                </a>{" "}
                (which uses{" "}
                <a
                  href="https://docs.zerodev.app/sdk/plugins/passkey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700"
                >
                  ERC-7212
                </a>{" "}
                when available) combined with{" "}
                <a
                  href="https://docs.zerodev.app/sdk/plugins/session-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700"
                >
                  session keys
                </a>
                .
              </p>
              <p className="mt-4">Steps:</p>
              <ul className="list-disc ml-8">
                <li>
                  Register (create a new passkey) or login (use an existing
                  passkey).
                </li>
                <li>
                  Send a UserOp, and observe that the first UserOp takes a lot
                  of gas.
                  <ul className="list-disc ml-4 mt-1">
                    <li>This is because we need to verify the passkey.</li>
                  </ul>
                </li>
                <li>
                  Send more UserOps, and observe that they all cost a lot less
                  gas than the first one.
                  <ul className="list-disc ml-4 mt-1">
                    <li>
                      This is because the UserOps are sent through cheap ECDSA
                      session keys.
                    </li>
                  </ul>
                </li>
              </ul>
              <p className="mt-4">
                To sum up, by combining passkeys with session keys, we get the
                best of both worlds where the user account is secured by their
                own passkey, but UserOps are still cheap due to using ECDSA
                session keys.
              </p>
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <input
                    type="text"
                    placeholder="Your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg w-full mb-4" // Added w-full and mb-4 for full width and margin-bottom
                  />
                  <button
                    onClick={handleRegister}
                    disabled={isRegistering || isLoggingIn}
                    className="flex justify-center items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 w-full" // Added w-full for full width
                  >
                    {isRegistering ? (
                      <div className="spinner"></div>
                    ) : (
                      "Register"
                    )}
                  </button>
                </div>
                <div>
                  <div className="h-full flex flex-col justify-end">
                    {" "}
                    {/* Add flex container to align items at the end */}
                    <button
                      onClick={handleLogin}
                      disabled={isLoggingIn || isRegistering}
                      className="flex justify-center items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 w-full" // Matched the classes of the Register button
                    >
                      {isLoggingIn ? <div className="spinner"></div> : "Login"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="border-t-2 pt-4">
                {accountAddress && (
                  <div className="mb-2 text-center font-medium">
                    Account Address:{" "}
                    <a
                      href={`https://jiffyscan.xyz/account/${accountAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700"
                    >
                      {accountAddress}
                    </a>
                  </div>
                )}
                <button
                  onClick={handleSendUserOp}
                  disabled={!isKernelClientReady || isSendingUserOp}
                  className={`w-full px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 flex justify-center items-center ${
                    isKernelClientReady && !isSendingUserOp
                      ? "bg-green-500 hover:bg-green-700 focus:ring-green-500"
                      : "bg-gray-500"
                  }`}
                >
                  {isSendingUserOp ? (
                    <div className="spinner"></div>
                  ) : (
                    "Send UserOp"
                  )}
                </button>
                {userOpHash && (
                  <div
                    className="mt-2 text-center"
                    dangerouslySetInnerHTML={{
                      __html: userOpStatus,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
