'use client'

import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from '@zerodev/sdk'
import { createPasskeyValidator, getPasskeyValidator } from '@zerodev/passkey-validator'
import { bundlerActions } from 'permissionless'
import React, { useState } from 'react'
import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem"
import { polygonMumbai, polygon } from 'viem/chains'
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import {
  signerToSessionKeyValidator,
  ParamOperator,
  serializeSessionKeyAccount,
  deserializeSessionKeyAccount,
  oneAddress,
} from "@zerodev/session-key"

const BUNDLER_URL = 'https://rpc.zerodev.app/api/v2/bundler/b5486fa4-e3d9-450b-8428-646e757c10f6'
const PAYMASTER_URL = 'https://rpc.zerodev.app/api/v2/paymaster/b5486fa4-e3d9-450b-8428-646e757c10f6'
const PASSKEY_SERVER_URL = " https://passkeys.zerodev.app/api/v2/b5486fa4-e3d9-450b-8428-646e757c10f6"
// const PASSKEY_SERVER_URL = "http://localhost:8080"

// const BUNDLER_URL = 'https://rpc.zerodev.app/api/v2/bundler/f5359ea1-5124-4051-af8f-220f34bf2f59'
// const PAYMASTER_URL = 'https://rpc.zerodev.app/api/v2/paymaster/f5359ea1-5124-4051-af8f-220f34bf2f59'
// const PASSKEY_SERVER_URL = " https://passkeys.zerodev.app/api/v2/f5359ea1-5124-4051-af8f-220f34bf2f59"

const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863"
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
])
const sessionPrivateKey = generatePrivateKey()
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey)

const publicClient = createPublicClient({
  transport: http(BUNDLER_URL),
})

let sessionKeyAccount: any
let kernelClient: any

export default function Home() {

  // State to store the input value
  const [username, setUsername] = useState('')
  const [isKernelClientReady, setIsKernelClientReady] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isSendingUserOp, setIsSendingUserOp] = useState(false)
  const [userOpHash, setUserOpHash] = useState('')
  const [userOpStatus, setUserOpStatus] = useState('')

  const createAccountAndClient = async (passkeyValidator: any) => {
    const masterAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: passkeyValidator,
      },
    })

    const sessionKeyValidator = await signerToSessionKeyValidator(publicClient, {
      signer: sessionKeySigner,
      validatorData: {
        paymaster: oneAddress,
        permissions: [
          {
            target: contractAddress,
            // Maximum value that can be transferred.  In this case we
            // set it to zero so that no value transfer is possible.
            valueLimit: BigInt(0),
            // Contract abi
            abi: contractABI,
            // Function name
            functionName: "mint",
            // An array of conditions, each corresponding to an argument for
            // the function.
            args: [
              {
                // In this case, we are saying that the session key can only mint
                // NFTs to the account itself
                operator: ParamOperator.EQUAL,
                value: masterAccount.address,
              },
            ],
          },
        ],
      },
    })

    sessionKeyAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: passkeyValidator,
        regular: sessionKeyValidator,
      },
    })

    kernelClient = createKernelAccountClient({
      account: sessionKeyAccount,
      chain: polygonMumbai,
      transport: http(BUNDLER_URL),
      sponsorUserOperation: async ({ userOperation }) => {
        const zerodevPaymaster = createZeroDevPaymasterClient({
          chain: polygonMumbai,
          transport: http(PAYMASTER_URL),
        })
        return zerodevPaymaster.sponsorUserOperation({
          userOperation
        })
      }
    })

    setIsKernelClientReady(true)
  }

  // Function to be called when "Register" is clicked
  const handleRegister = async () => {
    console.log('Registering with username:', username)
    setIsRegistering(true)

    const passkeyValidator = await createPasskeyValidator(publicClient, {
      passkeyName: username,
      registerOptionUrl: `${PASSKEY_SERVER_URL}/register/options`,
      registerVerifyUrl: `${PASSKEY_SERVER_URL}/register/verify`,
      signInitiateUrl: `${PASSKEY_SERVER_URL}/sign-initiate`,
      signVerifyUrl: `${PASSKEY_SERVER_URL}/sign-verify`
    })

    await createAccountAndClient(passkeyValidator)

    setIsRegistering(false)
    window.alert('Register done.  Try sending UserOps.')
  }

  const handleLogin = async () => {
    console.log('Logging in with username:', username)
    setIsLoggingIn(true)

    const passkeyValidator = await getPasskeyValidator(publicClient, {
      loginOptionUrl: `${PASSKEY_SERVER_URL}/login/options`,
      loginVerifyUrl: `${PASSKEY_SERVER_URL}/login/verify`,
      signInitiateUrl: `${PASSKEY_SERVER_URL}/sign-initiate`,
      signVerifyUrl: `${PASSKEY_SERVER_URL}/sign-verify`
    })

    await createAccountAndClient(passkeyValidator)

    setIsLoggingIn(false)
    window.alert('Login done.  Try sending UserOps.')
  }

  // Function to be called when "Login" is clicked
  const handleSendUserOp = async () => {
    setIsSendingUserOp(true)
    setUserOpStatus('Sending UserOp...')
    console.log('Sending userop with username:', username)

    const userOpHash = await kernelClient.sendUserOperation({
      userOperation: {
        callData: await sessionKeyAccount.encodeCallData({
          to: contractAddress,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: contractABI,
            functionName: "mint",
            args: [sessionKeyAccount.address],
          }),
        }),
      },
    })

    setUserOpHash(userOpHash)
    console.log("waiting for userOp:", userOpHash)

    const bundlerClient = kernelClient.extend(bundlerActions)
    await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    })

    setUserOpStatus(
      `UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=mumbai" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a>`
    );
    setIsSendingUserOp(false)
  }

  return (
    <>
      <header className="text-center p-6 bg-gray-100 border-b border-gray-200">
        <h1 className="text-lg font-semibold">
          Start by registering (creating a passkey) or logging in (using an existing passkey), then try sending a few UserOps.
        </h1>
      </header>
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-4 border-r-2 pr-4">
              <input
                type="text"
                placeholder="Your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg"
              />
              <button
                onClick={handleRegister}
                disabled={isRegistering || isLoggingIn}
                className="flex justify-center items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 relative"
              >
                {isRegistering ? <div className="spinner"></div> : 'Register'}
              </button>
            </div>
            <div className="flex flex-col justify-start">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn || isRegistering}
                className="flex justify-center items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 relative"
              >
                {isLoggingIn ? <div className="spinner"></div> : 'Login'}
              </button>
            </div>
          </div>
          <div className="border-t-2 pt-4">
            <button
              onClick={handleSendUserOp}
              disabled={!isKernelClientReady || isSendingUserOp}
              className={`w-full px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 flex justify-center items-center ${isKernelClientReady && !isSendingUserOp
                  ? 'bg-green-500 hover:bg-green-700 focus:ring-green-500'
                  : 'bg-gray-500'
                }`}
            >
              {isSendingUserOp ? <div className="spinner"></div> : 'Send UserOp'}
            </button>
            {userOpHash && (
              <div className="mt-2 text-center" dangerouslySetInnerHTML={{ __html: userOpStatus }} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
