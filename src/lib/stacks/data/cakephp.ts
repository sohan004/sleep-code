import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "cakephp",
  project: "training-bookings",
  branch: "feat/session-capacity-rules",
  indent: "Spaces: 4",
  files: [
    "config/routes.php",
    "src/Controller/AppController.php",
    "src/Controller/EnrolmentsController.php",
    "src/Model/Entity/Enrolment.php",
    "src/Model/Enum/EnrolmentStatus.php",
    "src/Model/Table/EnrolmentsTable.php",
    "src/Policy/EnrolmentPolicy.php",
    "tests/TestCase/Model/Table/EnrolmentsTableTest.php",
  ],
  snippets: [
    {
      filename: "src/Controller/EnrolmentsController.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php
declare(strict_types=1);

namespace App\\Controller;

use App\\Model\\Enum\\EnrolmentStatus;
use Cake\\Http\\Exception\\ConflictException;
use Cake\\I18n\\DateTime;
use Cake\\View\\JsonView;

// Authentication and Authorization components are loaded in AppController
class EnrolmentsController extends AppController
{
    private const CANCELLATION_CUTOFF_HOURS = 24;

    public function viewClasses(): array
    {
        return [JsonView::class];
    }

    public function index(): void
    {
        $query = $this->Authorization->applyScope(
            $this->Enrolments->find('withSessionDetails')
        );

        $courseId = $this->request->getQuery('course_id');
        if ($courseId !== null) {
            $query->where(['Sessions.course_id' => (int)$courseId]);
        }

        $enrolments = $this->paginate($query, [
            'limit' => 25,
            'maxLimit' => 100,
            'sortableFields' => ['created', 'Sessions.starts_at', 'status'],
        ]);

        $this->set(compact('enrolments'));
        $this->viewBuilder()->setOption('serialize', ['enrolments']);
    }

    public function add(): void
    {
        $this->request->allowMethod(['post']);

        // 'fields' limits mass assignment to what a member may actually set
        $enrolment = $this->Enrolments->patchEntity(
            $this->Enrolments->newEmptyEntity(),
            $this->request->getData(),
            ['fields' => ['session_id', 'notes']]
        );
        $enrolment->member_id = $this->Authentication->getIdentity()->getIdentifier();
        $enrolment->status = EnrolmentStatus::Confirmed;

        $this->Authorization->authorize($enrolment, 'create');

        $errors = [];
        if (!$this->Enrolments->save($enrolment)) {
            $errors = $enrolment->getErrors();
            $this->response = $this->response->withStatus(422);
        }

        $this->set(compact('enrolment', 'errors'));
        $this->viewBuilder()->setOption('serialize', ['enrolment', 'errors']);
    }

    public function cancel(int $id): void
    {
        $this->request->allowMethod(['post', 'delete']);

        $enrolment = $this->Enrolments->get($id, contain: ['Sessions']);
        $this->Authorization->authorize($enrolment, 'cancel');

        $cutoff = DateTime::now()->addHours(self::CANCELLATION_CUTOFF_HOURS);
        if ($enrolment->session->starts_at->lessThan($cutoff)) {
            throw new ConflictException('Enrolments cannot be cancelled within 24 hours.');
        }

        $enrolment->status = EnrolmentStatus::Cancelled;
        $this->Enrolments->saveOrFail($enrolment);

        $this->set(compact('enrolment'));
        $this->viewBuilder()->setOption('serialize', ['enrolment']);
    }
}
`,
    },
    {
      filename: "src/Model/Table/EnrolmentsTable.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php
declare(strict_types=1);

namespace App\\Model\\Table;

use App\\Model\\Entity\\Enrolment;
use App\\Model\\Enum\\EnrolmentStatus;
use Cake\\Database\\Type\\EnumType;
use Cake\\ORM\\Query\\SelectQuery;
use Cake\\ORM\\RulesChecker;
use Cake\\ORM\\Table;
use Cake\\Validation\\Validator;

class EnrolmentsTable extends Table
{
    public function initialize(array $config): void
    {
        parent::initialize($config);

        $this->setTable('enrolments');
        $this->setPrimaryKey('id');
        $this->addBehavior('Timestamp');

        $this->getSchema()->setColumnType('status', EnumType::from(EnrolmentStatus::class));

        $this->belongsTo('Sessions', ['joinType' => 'INNER']);
        $this->belongsTo('Members', [
            'className' => 'Users',
            'foreignKey' => 'member_id',
        ]);
    }

    public function validationDefault(Validator $validator): Validator
    {
        return $validator
            ->nonNegativeInteger('session_id')
            ->requirePresence('session_id', 'create')
            ->notEmptyString('session_id')
            ->scalar('notes')
            ->maxLength('notes', 500)
            ->allowEmptyString('notes');
    }

    public function buildRules(RulesChecker $rules): RulesChecker
    {
        $rules->add($rules->existsIn('session_id', 'Sessions'));
        $rules->add($rules->isUnique(
            ['session_id', 'member_id'],
            'You are already enrolled in this session.'
        ));
        $rules->addCreate(
            fn (Enrolment $enrolment): bool|string => $this->hasCapacity($enrolment->session_id)
                ?: 'This session is full.',
            'sessionCapacity',
            ['errorField' => 'session_id']
        );

        return $rules;
    }

    public function findWithSessionDetails(SelectQuery $query): SelectQuery
    {
        return $query
            ->contain(['Sessions' => ['Courses', 'Instructors']])
            ->orderBy(['Sessions.starts_at' => 'ASC']);
    }

    public function findUpcomingForMember(SelectQuery $query, int $memberId): SelectQuery
    {
        return $query
            ->find('withSessionDetails')
            ->where([
                'Enrolments.member_id' => $memberId,
                'Enrolments.status' => EnrolmentStatus::Confirmed,
                'Sessions.starts_at >' => new \\DateTimeImmutable(),
            ]);
    }

    public function hasCapacity(int $sessionId): bool
    {
        $capacity = $this->Sessions->find()
            ->select(['capacity'])
            ->where(['Sessions.id' => $sessionId])
            ->first()?->capacity ?? 0;

        $taken = $this->find()
            ->where([
                'session_id' => $sessionId,
                'status' => EnrolmentStatus::Confirmed,
            ])
            ->count();

        return $taken < $capacity;
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "QA managed to get 21 people into a 20-seat session by double-clicking enrol on two browsers. The `sessionCapacity` rule should have stopped that.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "The rule is correct, but it isn't atomic. `hasCapacity()` runs a `COUNT` and then `save()` inserts as a separate step, so two requests can both read 19 and both insert. Application rules can't close that gap alone.\n\nOptions, from strongest to lightest:\n1. **Lock the session row.** Wrap the save in `$this->Enrolments->getConnection()->transactional(...)` and read capacity with `->epilog('FOR UPDATE')`, so the second request waits until the first commits.\n2. **Keep a counter.** Add `confirmed_count` to `sessions` and use a conditional `UPDATE sessions SET confirmed_count = confirmed_count + 1 WHERE id = ? AND confirmed_count < capacity`. Treat zero affected rows as full.\n\nThe `isUnique` rule has the same race, so back it with a unique index on `(session_id, member_id)`.",
      delay: 12000,
    },
    {
      role: "user",
      content:
        "OK, I'll go with the locking approach. Does `index()` have any N+1 problems?",
      delay: 25000,
    },
    {
      role: "assistant",
      content:
        "No. `contain(['Sessions' => ['Courses', 'Instructors']])` uses `belongsTo` associations, which CakePHP fetches with joins in the same query. You get one `SELECT` plus the paginator's `COUNT`, however many rows are on the page.\n\nA few smaller points:\n- `sortableFields` is doing real security work. Without it, a `?sort=` parameter could order by any column, including joined ones you'd rather not expose.\n- `applyScope()` runs `EnrolmentPolicy`'s scope method, so make sure it filters by the identity's `member_id` for non-staff users. Otherwise the endpoint lists everyone's bookings.\n- If the JSON only needs the course title, add `->select()` with explicit fields so you don't serialise every column of `Instructors`.",
      delay: 36000,
    },
    {
      role: "user",
      content: "What should the table test cover?",
      delay: 50000,
    },
    {
      role: "assistant",
      content:
        "In `EnrolmentsTableTest`, use fixtures with one session that has `capacity` set to 2 and two confirmed enrolments, then cover:\n\n1. A third `newEntity()` plus `save()` returns `false`, and `getError('session_id')` contains **sessionCapacity**.\n2. A cancelled enrolment doesn't count towards capacity, which proves the status filter in `hasCapacity()`.\n3. A duplicate `(session_id, member_id)` fails `isUnique`.\n4. `findUpcomingForMember` excludes past sessions. Freeze time with `DateTime::setTestNow()` so the test doesn't depend on the clock.\n\nTest the 24-hour cancellation cutoff in the controller with `IntegrationTestTrait`, because that logic lives in `cancel()` rather than the table.",
      delay: 62000,
    },
  ],
};

export default config;
