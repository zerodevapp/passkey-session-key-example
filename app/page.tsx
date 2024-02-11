'use client'

import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from '@zerodev/sdk'
import { createPasskeyValidator } from '@zerodev/webauthn-validator'
import React, { useState } from 'react'
import { createPublicClient, http, zeroAddress, parseAbi } from "viem"
import { polygonMumbai } from 'viem/chains'
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
// const PASSKEY_SERVER_URL = "https://webauthn-demo-server.onrender.com"
const PASSKEY_SERVER_URL = "http://localhost:8080"

const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863"
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
])
const sessionPrivateKey = generatePrivateKey()
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey)

export default function Home() {

  // State to store the input value
  const [username, setUsername] = useState('')

  // Function to be called when "Register" is clicked
  const handleRegister = async () => {
    console.log('Registering with username:', username)

    const publicClient = createPublicClient({
      transport: http(BUNDLER_URL),  // use your RPC provider or bundler
    })

    const passkeyValidator = await createPasskeyValidator(publicClient, {
      passkeyName: username,
      registerOptionUrl: `${PASSKEY_SERVER_URL}/register/options`,
      registerVerifyUrl: `${PASSKEY_SERVER_URL}/register/verify`,
      signInitiateUrl: `${PASSKEY_SERVER_URL}/sign-initiate`,
      signVerifyUrl: `${PASSKEY_SERVER_URL}/sign-verify`
    })

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

    const sessionKeyAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: passkeyValidator,
        regular: sessionKeyValidator,
      },
    })

    const kernelClient = createKernelAccountClient({
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

    const userOpHash = await kernelClient.sendUserOperation({
      userOperation: {
        callData: await sessionKeyAccount.encodeCallData({
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        }),
      },
    })

    console.log("userOp hash:", userOpHash)
  }

  // Function to be called when "Login" is clicked
  const handleLogin = () => {
    console.log('Logging in with username:', username)
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-24">
      <div className="flex flex-col items-center gap-4">
        <input
          type="text"
          placeholder="Your username"
          className="input"
          value={username} // Controlled component
          onChange={(e) => setUsername(e.target.value)} // Update state on input change
        />
        <div className="flex gap-2">
          <button className="btn" onClick={handleRegister}>Register</button>
          <button className="btn" onClick={handleLogin}>Login</button>
        </div>
      </div>
    </main>
  )
}
