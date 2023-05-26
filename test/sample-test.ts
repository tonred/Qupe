import {expect} from "chai";
import {Address, Contract, fromNano, Signer, toNano, WalletTypes} from "locklift";
import {FactorySource} from "../build/factorySource";
import {log, pending, success} from "mocha-logger"

const artifacts = locklift.factory.getAllArtifacts()
const accountNames = new Map<string, string>()
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
    log(`${accountNames.get(addr)}(${addr.slice(0, 7)}): ${fromNano(balanceDiff.shiftedBy(0).toString())}`)


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
let profile: Contract<FactorySource["ChatProfile"]>;
let signer: Signer;
let wallets = new Map<string, Address>()

describe("Test Quashers Chat contracts", async function () {
  before(async () => {
    signer = (await locklift.keystore.getSigner("0"))!;

    for (let i = 0; i < 2; i++) {
      const {account} = await locklift.factory.accounts.addNewAccount({
        type: WalletTypes.EverWallet,
        value: toNano(100),
        publicKey: signer.publicKey,
      });
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
        publicKey: signer.publicKey,
        initParams: {
          _randomNonce: locklift.utils.getRandomNonce(),
        },
        constructorParams: {
          serverCode: locklift.factory.getContractArtifacts('Chat').code,
          roomCode: locklift.factory.getContractArtifacts('Channel').code,
          profileCode: locklift.factory.getContractArtifacts('ChatProfile').code,
          platformCode: locklift.factory.getContractArtifacts('Platform').code,
          sendMessageValue: toNano(0.1),
        },
        value: locklift.utils.toNano(2),
      });
      root = deployedRoot
      expect(await root.fields._constructorFlag()).to.be.true;
      success(`Root deployed: ${root.address.toString()}`)
    });
    it("Deploy Profile", async function () {
      const owner = wallets.get('wallet1');
      const tx = await locklift.tracing.trace(root.methods.createProfile({
        minTagValue: 0,
        pubkeys: [`0x${signer.publicKey}`],
        answerId: 0
      }).send({
        from: owner,
        amount: toNano(20),
      }));
      await tx.traceTree?.beautyPrint();
      log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
      await logDiff(tx)
      for (let deploy of tx.traceTree.findByTypeWithFullData({type: 'deploy', name: 'constructor'})) {
        if (deploy.contract.name === 'Platform') {
          const profileAddr = new Address(deploy.msg.dst)
          profile = await locklift.factory.getDeployedContract('ChatProfile', profileAddr)
        }
      }
      pending('Deposit tokens gas to Profile')
      const tx2 = await locklift.tracing.trace(profile.methods.deposit().send({
        from: owner,
        amount: toNano(20),
      }))
      await tx2.traceTree?.beautyPrint()
      log('Gas used: ', fromNano(tx2.traceTree.totalGasUsed()))
      await logDiff(tx2)
    })
    describe("Test Chat", async function () {
      let chat: Contract<FactorySource["Chat"]>;
      let channel: Contract<FactorySource["Channel"]>;
      it("Deploy chat with free messages", async function () {
        const owner = wallets.get('wallet1');
        const tx = await locklift.tracing.trace(root.methods.create({
          owner: owner,
          info: {
            meta: encodeData({
              title: 'Test chat Server #1',
              description: 'Test chat Server #1 description with free messages',
            }),
            createRoomPayment: emptyPayment,
          },
          answerId: 0
        }).send({
          from: owner,
          amount: toNano(3),
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
      // it("Set default permissions for server", async function () {
      //   const owner = wallets.get('wallet1');
      //   const tx = await locklift.tracing.trace(profile.methods.setServerPermissions({
      //     serverID: await chat.fields._serverID(),
      //     permissions: {values: [false, false, false, true, true]},
      //     remainingGasTo: owner
      //   }).send({from: owner, amount: toNano(3)}))
      //   await tx.traceTree?.beautyPrint();
      //   log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
      //   await logDiff(tx)
      // })
      it("Deploy Chat channel", async function () {
        const owner = wallets.get('wallet1');

        const tx = await locklift.tracing.trace(profile.methods.createRoom({
          serverID: await chat.fields._serverID(),
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
        }).send({from: owner, amount: toNano(2)}));
        await tx.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx.traceTree.totalGasUsed()))
        await logDiff(tx)
        for (let event of tx.traceTree.findByType({type: 'event', name: 'RoomCreated'})) {
          const {roomID, room: roomAddr} = event.params
          success(`Room deployed: ${roomAddr.toString()}, Id: ${roomID}`)
          channel = await locklift.factory.getDeployedContract('Channel', roomAddr)
        }
      });
      it("Send messages", async function () {
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
        }).sendExternal({publicKey: signer.publicKey}));
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
          }).sendExternal({publicKey: signer.publicKey}));
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
        }).sendExternal({publicKey: signer.publicKey}));
        await tx2.traceTree?.beautyPrint();
        log('Gas used: ', fromNano(tx2.traceTree.totalGasUsed()))
        await logDiff(tx2)
      })
    });
  });
});
