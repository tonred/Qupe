import {expect} from "chai";
import {Address, Contract, fromNano, Signer, toNano, WalletTypes} from "locklift";
import {FactorySource} from "../build/factorySource";
import {log, pending, success} from "mocha-logger"

const PROFILES_COUNT = 3

const artifacts = locklift.factory.getAllArtifacts()
const accountNames = new Map<string, string>()

function getKeyByValue<K, V>(map: Map<K, V>, value: V): K | null {
  for (const [key, val] of map.entries()) {
    if (val.equals(value)) {
      return key;
    }
  }
  return null;
}

const logDiff = async (tx: any): Promise<void> => {
  let diffs = Object.entries(tx.traceTree.balanceChangeInfo)
  if (diffs.length == 0) return
  log('Balance diff:')
  for (let diff of Object.entries(tx.traceTree.balanceChangeInfo)) {
    let addr = diff[0]
    let {balanceDiff} = diff[1] as any
    if (!accountNames.get(addr)) {
      const state = await locklift.provider.getFullContractState({address: new Address(addr)})
      artifacts.forEach((a) => {
        if (a.artifacts.codeHash == state.state.codeHash) {
          accountNames.set(addr, a.contractName)
        }
      })
    }
    let accountName = accountNames.has(addr) ? accountNames.get(addr) : getKeyByValue(wallets, addr);
    log(`${accountName}(${addr.slice(0, 7)}): ${fromNano(balanceDiff.shiftedBy(0).toString())}`)
  }
}

const encodeData = (data: any): string => {
  return Buffer.from(JSON.stringify(data)).toString('hex')
}

const emptyPayment = {
  token: new Address('0:0000000000000000000000000000000000000000000000000000000000000000'),
  amount: 0
}

const contracts = [
  'ChatRoot',
  // 'Forum',
  'Chat',
  // 'Blog',
  // 'Topic',
  'Channel',
  // 'Page',
  // 'Message',
  'ChatProfile',
  'Platform',
]
let root: Contract<FactorySource["ChatRoot"]>;
let signers = new Map<number, Signer>()
let wallets = new Map<string, Address>()
let profiles = new Map<string, Contract<FactorySource["ChatProfile"]>>();

describe("Test Quashers Chat contracts", async function () {
  before(async () => {
    for (let i = 0; i < PROFILES_COUNT; i++) {
      let signer = await locklift.keystore.getSigner(i.toString());
      const {account} = await locklift.factory.accounts.addNewAccount({
        type: WalletTypes.EverWallet,
        value: toNano(40),
        publicKey: signer.publicKey,
      });
      signers.set(i, signer)
      wallets.set(`wallet${i}`, account.address)
    }
  });

  describe("Contracts", async function () {
    it("Load contract factory", async function () {
      for (let contractName of contracts) {
        const contract = await locklift.factory.getContractArtifacts(contractName);
        expect(contract.code).not.to.equal(undefined, `Code should be available for contract: ${contractName}`);
        expect(contract.abi).not.to.equal(undefined, `ABI should be available for contract: ${contractName}`);
        expect(contract.tvc).not.to.equal(undefined, `tvc  should be available for contract: ${contractName}`);
      }
    });

    it("Deploy root contract", async function () {
      const {contract: deployedRoot, tx} = await locklift.factory.deployContract({
        contract: "ChatRoot",
        publicKey: signers.get(0).publicKey,
        initParams: {
          _randomNonce: locklift.utils.getRandomNonce(),
        },
        constructorParams: {
          admin: new Address('0:fa94171cb0565789224814561cc558e59315971ee9d03085de3dcb5f8b94d95e'),
          profileCode: locklift.factory.getContractArtifacts('ChatProfile').code,
          serverCode: locklift.factory.getContractArtifacts('Chat').code,
          roomCode: locklift.factory.getContractArtifacts('Channel').code,
          platformCode: locklift.factory.getContractArtifacts('Platform').code,
          sendMessageValue: toNano(0.1),
        },
        value: locklift.utils.toNano(0.6),
      });
      root = deployedRoot
      expect(await root.fields._constructorFlag()).to.be.true;
      success(`Root deployed: ${root.address.toString()}`)
    });

    it("Deploy Profile", async function () {
      for (let i = 0; i < PROFILES_COUNT; i++) {
        const signer = signers.get(i);
        const owner = wallets.get(`wallet${i}`);
        const tx = await locklift.tracing.trace(root.methods.createProfile({
          meta: encodeData({displayName: 'First user', avatar: 'QmUKiMzjKpHLSjHHQGhdXj17kyDDcGDiNEM9DevnjLm7PA'}),
          minTagValue: 0,
          pubkeys: [`0x${signer.publicKey}`],
          answerId: 0
        }).send({
          from: owner,
          amount: toNano(1.5),
        }));
        if (i == 1) {
          await tx.traceTree?.beautyPrint();
          log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
          await logDiff(tx)
        }
        for (let deploy of tx.traceTree.findByTypeWithFullData({type: 'deploy', name: 'constructor'})) {
          if (deploy.contract.name === 'Platform') {
            const profileAddr = new Address(deploy.msg.dst)
            let profile = await locklift.factory.getDeployedContract('ChatProfile', profileAddr)
            profiles.set(`profile${i}`, profile)
          }
        }
        const profile = profiles.get(`profile${i}`);
        pending('Deposit tokens gas to Profile')
        const tx2 = await locklift.tracing.trace(profile.methods.deposit().send({
          from: owner,
          amount: toNano(20),
        }))
        if (i == 1) {
          await tx2.traceTree?.beautyPrint()
          log('Gas used: ', fromNano(tx2.traceTree.totalGasUsed()))
          await logDiff(tx2)
        }
      }
    });

    describe("Test Chat", async function () {
      let chat: Contract<FactorySource["Chat"]>;
      let channel: Contract<FactorySource["Channel"]>;
      it("Deploy chat with free rooms", async function () {
        const owner = wallets.get('wallet0');
        const tx = await locklift.tracing.trace(root.methods.createServer({
          owner: owner,
          info: {
            meta: encodeData({
              title: 'Test chat Server #1',
              description: `# Server description example`,
            }),
            createRoomPayment: emptyPayment,
          },
          answerId: 0
        }).send({
          from: owner,
          amount: toNano(2),
        }));
        await tx.traceTree?.beautyPrint();

        for (let deploy of tx.traceTree.findByTypeWithFullData({type: 'deploy', name: 'constructor'})) {
          if (deploy.contract.name === 'Platform') {
            const chatAddress = new Address(deploy.msg.dst)
            chat = await locklift.factory.getDeployedContract('Chat', chatAddress)
          }
        }
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
        success(`Chat deployed: ${chat.address.toString()}, Id: ${await chat.fields._serverID()}`)

      });

      it("Deploy Chat Channel", async function () {
        const owner = wallets.get('wallet0');
        const profile = profiles.get('profile0');
        const tx = await locklift.tracing.trace(profile.methods.createRoom({
          serverID: await chat.fields._serverID(),
          anyCanSendMessage: true,
          info: {
            meta: encodeData({
              title: 'Test free chat room #1',
              description: 'some description',
              categories: [],
            }),
            messagePayment: emptyPayment,
            highlightMessagePayment: emptyPayment,
          },
          owner,
          payment: emptyPayment
        }).send({from: owner, amount: toNano(1.5)}));
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
        for (let event of tx.traceTree.findByType({type: 'event', name: 'RoomCreated'})) {
          const {roomID, room: roomAddr} = event.params
          if (roomAddr) {
            success(`Room deployed: ${roomAddr.toString()}, Id: ${roomID}`)
            channel = await locklift.factory.getDeployedContract('Channel', roomAddr)
          }
        }
      });

      it("Send messages", async function () {
        const profile = profiles.get('profile0');
        const serverID = await chat.fields._serverID()
        const roomID = await channel.fields._roomID()
        const tx = await locklift.tracing.trace(profile.methods.sendMessage({
          version: 1,
          serverID: serverID,
          roomID: roomID,
          message: encodeData({'c': 'First test message'}),
          replyToMessageHash: null,
          forwardMessageHash: null,
          highlight: false,
          tags: [],
          payment: emptyPayment
        }).sendExternal({publicKey: signers.get(0).publicKey}));
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)

        pending('Spam messages')
        for (let i = 0; i < 10; i++) {
          const tx = await locklift.tracing.trace(profile.methods.sendMessage({
            version: 1,
            serverID: serverID,
            roomID: roomID,
            message: encodeData({'c': `Spam #${i}`}),
            replyToMessageHash: null,
            forwardMessageHash: null,
            highlight: false,
            tags: [],
            payment: emptyPayment
          }).sendExternal({publicKey: signers.get(0).publicKey}));
        }

        const tx2 = await locklift.tracing.trace(profile.methods.sendMessage({
          version: 1,
          serverID: serverID,
          roomID: roomID,
          message: encodeData({'c': 'Last test message'}),
          replyToMessageHash: null,
          forwardMessageHash: null,
          highlight: false,
          tags: [],
          payment: emptyPayment
        }).sendExternal({publicKey: signers.get(0).publicKey}));
        await tx2.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx2.traceTree.totalGasUsed()))
        await logDiff(tx2)
      });

      it("Send message before join", async function () {
        const profile = profiles.get('profile1');
        const serverID = await chat.fields._serverID()
        const roomID = await channel.fields._roomID()
        const tx = await locklift.tracing.trace(profile.methods.sendMessage({
          version: 1,
          serverID: serverID,
          roomID: roomID,
          message: encodeData({'c': 'Message of second user before join (reverted)'}),
          replyToMessageHash: null,
          forwardMessageHash: null,
          highlight: false,
          tags: [],
          payment: emptyPayment
        }).sendExternal({publicKey: signers.get(1).publicKey}), {
          allowedCodes: {
            compute: [1106],
          }
        });
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
      });

      it("Join server", async function () {
        const user = wallets.get('wallet1');
        const profile = profiles.get('profile1');
        const tx = await locklift.tracing.trace(
          profile.methods.join({
            serverID: await chat.fields._serverID(),
          }).send({from: user, amount: toNano(1)})
        )
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
      });

      it("Send message after join", async function () {
        const profile = profiles.get('profile1');
        const serverID = await chat.fields._serverID()
        const roomID = await channel.fields._roomID()
        const tx = await locklift.tracing.trace(profile.methods.sendMessage({
          version: 1,
          serverID: serverID,
          roomID: roomID,
          message: encodeData({'c': 'Message of second user after join'}),
          replyToMessageHash: null,
          forwardMessageHash: null,
          highlight: false,
          tags: [],
          payment: emptyPayment
        }).sendExternal({publicKey: signers.get(1).publicKey}));
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
      });

      it("Ban without permissions", async function () {
        const wallet = wallets.get('wallet1');
        const profile = profiles.get('profile1');
        const serverID = await chat.fields._serverID()
        const roomID = await channel.fields._roomID()
        const tx = await locklift.tracing.trace(profile.methods.setBan({
          serverID: serverID,
          roomID: roomID,
          user: wallets.get('wallet2'),
          isBan: true,
        }).send({from: wallet, amount: toNano(1.5)}), {
          allowedCodes: {
            compute: [1401],
          }
        });
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
      });

      it("Set permissions for room user", async function () {
        const owner = wallets.get('wallet0');
        const profile = profiles.get('profile0');
        const tx = await locklift.tracing.trace(profile.methods.setPermissions({
          entity: channel.address,
          user: wallets.get('wallet1'),
          permissions: {values: [false, true, true, true, true]},
        }).send({from: owner, amount: toNano(1.5)}))
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
      })

      it("Ban with permissions", async function () {
        const wallet = wallets.get('wallet1');
        const profile = profiles.get('profile1');
        const serverID = await chat.fields._serverID()
        const roomID = await channel.fields._roomID()
        const tx = await locklift.tracing.trace(profile.methods.setBan({
          serverID: serverID,
          roomID: roomID,
          user: wallets.get('wallet2'),
          isBan: true,
        }).send({from: wallet, amount: toNano(1.5)}), {
          allowedCodes: {
            compute: [1106],
          }
        });
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)

        const user2 = wallets.get('wallet2');
        const profile2 = profiles.get('profile2');
        await locklift.tracing.trace(
          profile2.methods.join({
            serverID: await chat.fields._serverID(),
          }).send({from: user2, amount: toNano(1)})
        )

        const tx3 = await locklift.tracing.trace(profile2.methods.sendMessage({
          version: 1,
          serverID: serverID,
          roomID: roomID,
          message: encodeData({'c': 'Message of second user after join'}),
          replyToMessageHash: null,
          forwardMessageHash: null,
          highlight: false,
          tags: [],
          payment: emptyPayment
        }).sendExternal({publicKey: signers.get(2).publicKey}), {
          allowedCodes: {
            compute: [1401],
          }
        });
        await tx3.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx3.traceTree.totalGasUsed()))
        await logDiff(tx3)
      });

    });
  });
});
