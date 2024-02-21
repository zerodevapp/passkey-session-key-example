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
  oneAddress,
} from "@zerodev/session-key"

const BUNDLER_URL = 'https://rpc.zerodev.app/api/v2/bundler/b5486fa4-e3d9-450b-8428-646e757c10f6'
const PAYMASTER_URL = 'https://rpc.zerodev.app/api/v2/paymaster/b5486fa4-e3d9-450b-8428-646e757c10f6'
const PASSKEY_SERVER_URL = " https://passkeys.zerodev.app/api/v2/b5486fa4-e3d9-450b-8428-646e757c10f6"
const CHAIN = polygonMumbai

// const BUNDLER_URL = 'https://rpc.zerodev.app/api/v2/bundler/f5359ea1-5124-4051-af8f-220f34bf2f59'
// const PAYMASTER_URL = 'https://rpc.zerodev.app/api/v2/paymaster/f5359ea1-5124-4051-af8f-220f34bf2f59'
// const PASSKEY_SERVER_URL = " https://passkeys.zerodev.app/api/v2/f5359ea1-5124-4051-af8f-220f34bf2f59"
// const CHAIN = polygon

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
  const [accountAddress, setAccountAddress] = useState('')
  const [isKernelClientReady, setIsKernelClientReady] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isSendingUserOp, setIsSendingUserOp] = useState(false)
  const [userOpHash, setUserOpHash] = useState('')
  const [userOpStatus, setUserOpStatus] = useState('')
  const [userOpCount, setUserOpCount] = useState(0)

  const createAccountAndClient = async (passkeyValidator: any) => {
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
            args: [null],
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
      chain: CHAIN,
      transport: http(BUNDLER_URL),
      sponsorUserOperation: async ({ userOperation }) => {
        const zerodevPaymaster = createZeroDevPaymasterClient({
          chain: CHAIN,
          transport: http(PAYMASTER_URL),
        })
        return zerodevPaymaster.sponsorUserOperation({
          userOperation
        })
      }
    })

    setIsKernelClientReady(true)
    setAccountAddress(sessionKeyAccount.address)
  }

  // Function to be called when "Register" is clicked
  const handleRegister = async () => {
    console.log('Registering with username:', username)
    setIsRegistering(true)

    const passkeyValidator = await createPasskeyValidator(publicClient, {
      passkeyName: username,
      passkeyServerUrl: PASSKEY_SERVER_URL,
    })

    await createAccountAndClient(passkeyValidator)

    setIsRegistering(false)
    window.alert('Register done.  Try sending UserOps.')
  }

  const handleLogin = async () => {
    console.log('Logging in with username:', username)
    setIsLoggingIn(true)

    const passkeyValidator = await getPasskeyValidator(publicClient, {
      passkeyServerUrl: PASSKEY_SERVER_URL,
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

    setUserOpCount(userOpCount + 1)

    // Update the message based on the count of UserOps
    const userOpMessage = userOpCount === 0
      ? `First UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=mumbai" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a> <br> Now try sending another UserOp.`
      : `UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=mumbai" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a> <br> Notice how this UserOp costs a lot less gas and requires no prompting.`

    setUserOpStatus(userOpMessage)
    setIsSendingUserOp(false)
  }

  return (
    <>
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-6xl">
          <h1 className="text-4xl font-semibold text-center mb-12">
            ZeroDev Passkeys + Session Keys Demo
          </h1>
          <div className="grid grid-cols-2 gap-12">
            <div className="text-lg">
              <p>This demo showcases the ZeroDev <a href="https://docs.zerodev.app/sdk/plugins/passkeys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">passkey validator</a> (which uses <a href="https://docs.zerodev.app/sdk/plugins/passkey" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">ERC-7212</a> when available) combined with <a href="https://docs.zerodev.app/sdk/plugins/session-keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">session keys</a>.</p>
              <p className="mt-4">Steps:</p>
              <ul className="list-disc ml-8">
                <li>Register (create a new passkey) or login (use an existing passkey).</li>
                <li>Send a UserOp, and observe that the first UserOp takes a lot of gas.
                  <ul className="list-disc ml-4 mt-1">
                    <li>This is because we need to verify the passkey.</li>
                  </ul>
                </li>
                <li>Send more UserOps, and observe that they all cost a lot less gas than the first one.
                  <ul className="list-disc ml-4 mt-1">
                    <li>This is because the UserOps are sent through cheap ECDSA session keys.</li>
                  </ul>
                </li>
              </ul>
              <p className="mt-4">To sum up, by combining passkeys with session keys, we get the best of both worlds where the user account is secured by their own passkey, but UserOps are still cheap due to using ECDSA session keys.</p>
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
                    {isRegistering ? <div className="spinner"></div> : 'Register'}
                  </button>
                </div>
                <div>
                  <div className="h-full flex flex-col justify-end"> {/* Add flex container to align items at the end */}
                    <button
                      onClick={handleLogin}
                      disabled={isLoggingIn || isRegistering}
                      className="flex justify-center items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 w-full" // Matched the classes of the Register button
                    >
                      {isLoggingIn ? <div className="spinner"></div> : 'Login'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="border-t-2 pt-4">
                {accountAddress && (
                  <div className="mb-2 text-center font-medium">
                    Account Address: <a href={`https://jiffyscan.xyz/account/${accountAddress}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                      {accountAddress}
                    </a>
                  </div>
                )}
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
          </div>
        </div>
      </main>
    </>
  );
}
