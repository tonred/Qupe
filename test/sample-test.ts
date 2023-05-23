import {expect} from "chai";
import {Address, Contract, Signer, toNano, WalletTypes} from "locklift";
import {FactorySource} from "../build/factorySource";

const emptyPayment = {
  token: new Address('0:0000000000000000000000000000000000000000000000000000000000000000'),
  amount: 0
}
const contracts = [
  'Root',
  'Forum',
  'Chat',
  'Blog',
  'Topic',
  'Channel',
  'Page',
  'Message',
  'Profile',
  'Platform',
]
let root: Contract<FactorySource["Root"]>;
let profile: Contract<FactorySource["Profile"]>;
let signer: Signer;
let wallets = new Map<string, Address>()
describe("Test Quashers contracts", async function () {
  before(async () => {
    signer = (await locklift.keystore.getSigner("0"))!;

    for (let i = 0; i < 2; i++) {
      const {account} = await locklift.factory.accounts.addNewAccount({
        type: WalletTypes.EverWallet, // or WalletTypes.HighLoadWallet or WalletTypes.WalletV3,
        //Value which will send to the new account from a giver
        value: toNano(100),
        //owner publicKey
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
      // root = await locklift.factory.getDeployedContract('Root', new Address('0:616f6998cd6a678d5c87417d6bb48a8ec4ec4346b5396139af9b41a1fd43e886'))
      const {contract: deployedRoot, tx} = await locklift.factory.deployContract({
        contract: "Root",
        publicKey: signer.publicKey,
        initParams: {
          _randomNonce: locklift.utils.getRandomNonce(),
        },
        constructorParams: {
          codes: {
            forum: locklift.factory.getContractArtifacts('Forum').code,
            chat: locklift.factory.getContractArtifacts('Chat').code,
            blog: locklift.factory.getContractArtifacts('Blog').code,
            topic: locklift.factory.getContractArtifacts('Topic').code,
            channel: locklift.factory.getContractArtifacts('Channel').code,
            page: locklift.factory.getContractArtifacts('Page').code,
            message: locklift.factory.getContractArtifacts('Message').code,
            profile: locklift.factory.getContractArtifacts('Profile').code,
          },
          platformCode: locklift.factory.getContractArtifacts('Platform').code
        },
        value: locklift.utils.toNano(2),
      });
      root = deployedRoot
      expect(await root.fields._constructorFlag()).to.be.true;
    });
    it("Deploy Profile", async function () {
      const owner = wallets.get('wallet1');
      const tx = await locklift.tracing.trace(root.methods.createProfile({
        pubkeys: [`0x${signer.publicKey}`],
        answerId: 0
      }).send({
        from: owner,
        amount: toNano(2),
      }));
      await tx.traceTree?.beautyPrint();
      for (let deploy of tx.traceTree.findByTypeWithFullData({type: 'deploy', name: 'constructor'})) {
        if (deploy.contract.name === 'Platform') {
          const profileAddr = new Address(deploy.msg.dst)
          profile = await locklift.factory.getDeployedContract('Profile', profileAddr)
        }
      }
    })
    describe("Test Chat", async function () {
      let chat: Contract<FactorySource["Chat"]>;
      it("Deploy chat with free messages", async function () {
        const owner = wallets.get('wallet1');
        const tx = await locklift.tracing.trace(root.methods.createChat({
          owner: owner,
          info: {
            title: 'Test chat Server #1',
            description: 'Test chat Server #1 description with free messages',
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

        // console.log(tx)
        // const response = await sample.methods._randomNonce({}).call();
        //
        // expect(Number(response._randomNonce)).to.be.greaterThan(0, "Wrong nonce");
      });
      it("Deploy Chat channel", async function () {
        const owner = wallets.get('wallet1');
        const serverId = await chat.fields._serverID()
        console.log(`Chat addr: ${chat.address.toString()}, Id: ${serverId}`)
        const tx = await locklift.tracing.trace(profile.methods.createRoom({
          serverID: serverId,
          params: (await chat.methods.encodeCreateRoomParams({
            answerId: 0,
            owner,
            info: {
              title: 'Test free chat room #1',
              description: 'some description',
              categories: [],
              messagePayment: emptyPayment,
              highlightMessagePayment: emptyPayment,
            }
          }).call()).params,
          payment: emptyPayment
        }).send({from: owner, amount: toNano(2)}));
        await tx.traceTree?.beautyPrint();
      });
    });
  });
});
